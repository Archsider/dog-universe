# Wave 1 — Manual cleanup SQL (Supabase)

These queries fix the **data corruption** that accumulated in production
before the Wave-1 PR shipped its code-level fixes. Each block is
idempotent and safe to run multiple times.

**Do NOT run these blindly.** Read each one, understand which production
rows it will touch, and run them in the Supabase SQL editor with
manual confirmation. The Wave-1 PR code prevents new corruption, but
existing rows need explicit cleanup.

---

## Bug #1 — Athena & co. duplicates

### 1.1 — Find ALL active duplicate Pet rows

```sql
-- Lists every (ownerId, name, species) tuple that has more than one
-- non-soft-deleted Pet row. The output is the universe of duplicates
-- to triage. Sort by oldest createdAt last so the "survivor candidate"
-- is the first row of each group.
SELECT
  "ownerId",
  LOWER(TRIM("name")) AS norm_name,
  species,
  COUNT(*) AS dupe_count,
  ARRAY_AGG(id ORDER BY "createdAt") AS pet_ids,
  ARRAY_AGG("name" ORDER BY "createdAt") AS name_variants,
  ARRAY_AGG("createdAt" ORDER BY "createdAt") AS created_dates
FROM "Pet"
WHERE "deletedAt" IS NULL
GROUP BY "ownerId", LOWER(TRIM("name")), species
HAVING COUNT(*) > 1
ORDER BY dupe_count DESC, "ownerId";
```

### 1.2 — Audit linked bookings before merging duplicates

For each duplicate group from 1.1, see which Pet rows are actually used
in BookingPet links before deciding who to keep.

```sql
-- Replace the array literal with the pet_ids of one duplicate group.
SELECT
  p.id,
  p."name",
  p."createdAt",
  COUNT(bp.id) AS booking_count,
  ARRAY_AGG(DISTINCT b.status) FILTER (WHERE b.id IS NOT NULL) AS booking_statuses
FROM "Pet" p
LEFT JOIN "BookingPet" bp ON bp."petId" = p.id
LEFT JOIN "Booking" b ON b.id = bp."bookingId"
WHERE p.id = ANY (ARRAY['pet_id_1', 'pet_id_2', 'pet_id_3', '...']::text[])
GROUP BY p.id, p."name", p."createdAt"
ORDER BY booking_count DESC, p."createdAt";
```

**Convention**: keep the Pet with the most bookings; if tied, keep the
oldest. Re-link other duplicates' BookingPet rows to the survivor, then
soft-delete the dupes.

### 1.3 — Merge: re-link bookings to the survivor, soft-delete dupes

```sql
-- TRANSACTION — run as a single block. KEEP_ID is the survivor; DUPE_IDS
-- are the rest of the group. The unique index on (bookingId, petId) on
-- BookingPet prevents creating a duplicate link by accident.
BEGIN;
  -- 1) Re-link any BookingPet rows pointing at duplicates to the survivor.
  --    `ON CONFLICT DO NOTHING` handles the case where the survivor was
  --    already linked to the same booking — we just drop the dupe link.
  WITH dupe_links AS (
    DELETE FROM "BookingPet"
    WHERE "petId" = ANY (ARRAY['DUPE_ID_1', 'DUPE_ID_2']::text[])
    RETURNING "bookingId"
  )
  INSERT INTO "BookingPet" ("id", "bookingId", "petId")
  SELECT
    gen_random_uuid()::text,
    "bookingId",
    'KEEP_ID'
  FROM dupe_links
  ON CONFLICT ("bookingId", "petId") DO NOTHING;

  -- 2) Soft-delete the duplicates. Their relations (vaccinations, docs)
  --    stay attached to the now-soft-deleted Pet — that's fine because
  --    the survivor has its own copies and the dupes are filtered out
  --    of every list by the `deletedAt IS NULL` convention.
  UPDATE "Pet"
  SET "deletedAt" = NOW()
  WHERE id = ANY (ARRAY['DUPE_ID_1', 'DUPE_ID_2']::text[]);

  -- 3) Log the merge for audit trail.
  INSERT INTO "ActionLog" ("id", "userId", "action", "entityType", "entityId", "details", "createdAt")
  VALUES (
    gen_random_uuid()::text,
    NULL,
    'PET_DUPLICATE_MERGED',
    'Pet',
    'KEEP_ID',
    jsonb_build_object(
      'merged_from', ARRAY['DUPE_ID_1', 'DUPE_ID_2'],
      'reason', 'wave-1 manual cleanup'
    ),
    NOW()
  );
COMMIT;
```

### 1.4 — Optional: DB-level unique index (defense in depth)

The code fix in `POST /api/admin/animals` and `POST /api/pets` does a
read-before-create check. A concurrent double-submit can still race
through that check between the read and the `prisma.pet.create`. A
unique partial index closes that window for good:

```sql
-- Run AFTER the merge above is complete and verified — otherwise this
-- migration will fail on existing duplicates.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS
  "Pet_owner_name_species_active_unique"
ON "Pet" ("ownerId", LOWER(TRIM("name")), species)
WHERE "deletedAt" IS NULL;
```

If you want to ship this, add a migration file under
`prisma/migrations/YYYYMMDD_pet_unique_active/migration.sql` and update
the application code to catch the resulting P2002 → return the existing
row (the in-route dedup will catch most cases first; this is the
race-condition net).

---

## Bug #3 — Zombie TaxiTrip rows

The Wave-1 cascade fixes the *new* COMPLETED transitions, but existing
zombies stay zombies until you flush them.

### 3.1 — List zombie trips

```sql
SELECT
  tt.id            AS trip_id,
  tt."tripType",
  tt.status        AS trip_status,
  tt."updatedAt"   AS trip_updated_at,
  b.id             AS booking_id,
  b.status         AS booking_status,
  b."endDate",
  u.name           AS client_name
FROM "TaxiTrip" tt
JOIN "Booking" b ON b.id = tt."bookingId"
JOIN "User" u    ON u.id = b."clientId"
WHERE
  b.status = 'COMPLETED'
  AND tt.status IN ('EN_ROUTE_TO_CLIENT', 'ON_SITE_CLIENT', 'ANIMAL_ON_BOARD')
ORDER BY b."endDate" DESC;
```

### 3.2 — Cascade them to terminal (matches the code-level cascade)

```sql
BEGIN;
  -- Drive every active trip on a COMPLETED booking to its
  -- type-specific terminal status. tracking* fields are cleared to
  -- mirror the manual terminal transition in
  -- /api/admin/taxi-trips/[id]/status.
  WITH updated AS (
    UPDATE "TaxiTrip" tt
    SET
      status = CASE
        WHEN tt."tripType" = 'RETURN' THEN 'ARRIVED_AT_CLIENT'
        ELSE 'ARRIVED_AT_PENSION'
      END,
      "trackingActive" = false,
      "trackingToken"  = NULL,
      "updatedAt"      = NOW()
    FROM "Booking" b
    WHERE
      tt."bookingId" = b.id
      AND b.status = 'COMPLETED'
      AND tt.status IN ('EN_ROUTE_TO_CLIENT', 'ON_SITE_CLIENT', 'ANIMAL_ON_BOARD')
    RETURNING tt.id, tt."tripType", tt.status
  )
  INSERT INTO "TaxiStatusHistory" ("id", "taxiTripId", "status", "updatedBy")
  SELECT
    gen_random_uuid()::text,
    u.id,
    u.status,
    'AUTO_BOOKING_COMPLETED_CLEANUP',
    NOW()
  FROM updated u;
COMMIT;
```

---

## Bug #4 — Missing TaxiTrip rows for boardings with taxi addon

The Wave-1 fix creates TaxiTrip rows at *new* booking-creation time.
Existing bookings need a one-time backfill.

### 4.1 — List bookings missing their TaxiTrip rows

```sql
-- Outbound addon enabled but no OUTBOUND TaxiTrip row exists
SELECT
  b.id          AS booking_id,
  b.status      AS booking_status,
  u.name        AS client_name,
  bd."taxiGoDate",
  bd."taxiGoTime",
  bd."taxiGoAddress"
FROM "Booking" b
JOIN "BoardingDetail" bd ON bd."bookingId" = b.id
JOIN "User" u            ON u.id = b."clientId"
WHERE
  bd."taxiGoEnabled" = true
  AND b."deletedAt" IS NULL
  AND b.status IN ('PENDING', 'CONFIRMED', 'IN_PROGRESS')
  AND NOT EXISTS (
    SELECT 1 FROM "TaxiTrip" tt
    WHERE tt."bookingId" = b.id AND tt."tripType" = 'OUTBOUND'
  )
ORDER BY bd."taxiGoDate" NULLS LAST;

-- Same for RETURN
SELECT
  b.id          AS booking_id,
  b.status      AS booking_status,
  u.name        AS client_name,
  bd."taxiReturnDate",
  bd."taxiReturnTime",
  bd."taxiReturnAddress"
FROM "Booking" b
JOIN "BoardingDetail" bd ON bd."bookingId" = b.id
JOIN "User" u            ON u.id = b."clientId"
WHERE
  bd."taxiReturnEnabled" = true
  AND b."deletedAt" IS NULL
  AND b.status IN ('PENDING', 'CONFIRMED', 'IN_PROGRESS')
  AND NOT EXISTS (
    SELECT 1 FROM "TaxiTrip" tt
    WHERE tt."bookingId" = b.id AND tt."tripType" = 'RETURN'
  )
ORDER BY bd."taxiReturnDate" NULLS LAST;
```

### 4.2 — Backfill missing rows

```sql
BEGIN;
  -- OUTBOUND backfill
  WITH inserted AS (
    INSERT INTO "TaxiTrip" (
      "id", "bookingId", "tripType", "status",
      "date", "time", "address",
      "createdAt", "updatedAt"
    )
    SELECT
      gen_random_uuid()::text,
      b.id,
      'OUTBOUND',
      'PLANNED',
      bd."taxiGoDate",
      bd."taxiGoTime",
      bd."taxiGoAddress",
      NOW(), NOW()
    FROM "Booking" b
    JOIN "BoardingDetail" bd ON bd."bookingId" = b.id
    WHERE
      bd."taxiGoEnabled" = true
      AND b."deletedAt" IS NULL
      AND b.status IN ('PENDING', 'CONFIRMED', 'IN_PROGRESS')
      AND NOT EXISTS (
        SELECT 1 FROM "TaxiTrip" tt
        WHERE tt."bookingId" = b.id AND tt."tripType" = 'OUTBOUND'
      )
    RETURNING id
  )
  INSERT INTO "TaxiStatusHistory" ("id", "taxiTripId", "status", "updatedBy")
  SELECT
    gen_random_uuid()::text, i.id, 'PLANNED',
    'WAVE_1_BACKFILL', NOW()
  FROM inserted i;

  -- RETURN backfill (same pattern)
  WITH inserted_ret AS (
    INSERT INTO "TaxiTrip" (
      "id", "bookingId", "tripType", "status",
      "date", "time", "address",
      "createdAt", "updatedAt"
    )
    SELECT
      gen_random_uuid()::text,
      b.id,
      'RETURN',
      'PLANNED',
      bd."taxiReturnDate",
      bd."taxiReturnTime",
      bd."taxiReturnAddress",
      NOW(), NOW()
    FROM "Booking" b
    JOIN "BoardingDetail" bd ON bd."bookingId" = b.id
    WHERE
      bd."taxiReturnEnabled" = true
      AND b."deletedAt" IS NULL
      AND b.status IN ('PENDING', 'CONFIRMED', 'IN_PROGRESS')
      AND NOT EXISTS (
        SELECT 1 FROM "TaxiTrip" tt
        WHERE tt."bookingId" = b.id AND tt."tripType" = 'RETURN'
      )
    RETURNING id
  )
  INSERT INTO "TaxiStatusHistory" ("id", "taxiTripId", "status", "updatedBy")
  SELECT
    gen_random_uuid()::text, i.id, 'PLANNED',
    'WAVE_1_BACKFILL', NOW()
  FROM inserted_ret i;
COMMIT;
```

After running this, the driver-mode "Prochaines courses" list will
include Marie Lagarde and any other clients who were silently dropped.

---

## Verification queries (post-cleanup)

```sql
-- Should return 0 rows after Bug #1 cleanup
SELECT COUNT(*) FROM (
  SELECT "ownerId", LOWER(TRIM("name")), species, COUNT(*)
  FROM "Pet"
  WHERE "deletedAt" IS NULL
  GROUP BY "ownerId", LOWER(TRIM("name")), species
  HAVING COUNT(*) > 1
) dupes;

-- Should return 0 rows after Bug #3 cleanup
SELECT COUNT(*) FROM "TaxiTrip" tt
JOIN "Booking" b ON b.id = tt."bookingId"
WHERE b.status = 'COMPLETED'
  AND tt.status IN ('EN_ROUTE_TO_CLIENT', 'ON_SITE_CLIENT', 'ANIMAL_ON_BOARD');

-- Should return 0 rows after Bug #4 cleanup
SELECT COUNT(*) FROM "Booking" b
JOIN "BoardingDetail" bd ON bd."bookingId" = b.id
WHERE bd."taxiGoEnabled" = true
  AND b."deletedAt" IS NULL
  AND b.status IN ('PENDING', 'CONFIRMED', 'IN_PROGRESS')
  AND NOT EXISTS (
    SELECT 1 FROM "TaxiTrip" tt
    WHERE tt."bookingId" = b.id AND tt."tripType" = 'OUTBOUND'
  );
```
