# Cleanup — TaxiTrip orphelins sur réservations COMPLETED

Contexte : avant le fix de la PR #169 (et son extension racine), les
réservations walk-in rétroactives (`status='COMPLETED'`) avec addon taxi
créaient quand même un `TaxiTrip` en `status='PLANNED'`. Symptôme : sur
la fiche réservation, Mehdi voyait le pipeline 5-steps avec bouton
"Mettre en route" sur un trajet qui avait déjà eu lieu il y a des jours.

Le code post-PR-#169 prévient les NOUVEAUX cas. Cette doc liste la requête
pour identifier et corriger les rows EXISTANTES en DB.

## Étape 1 — Audit read-only

Exécuter dans Supabase SQL Editor :

```sql
SELECT
  t.id              AS taxi_trip_id,
  t."tripType",
  t.status          AS taxi_status,
  b.id              AS booking_id,
  b."isWalkIn",
  b.source,
  b.status          AS booking_status,
  b."startDate",
  b."endDate",
  u.name            AS client_name
FROM "TaxiTrip" t
JOIN "Booking" b ON t."bookingId" = b.id
JOIN "User" u ON b."clientId" = u.id
WHERE
  b.status = 'COMPLETED'
  AND t.status NOT IN ('ARRIVED_AT_PENSION', 'ARRIVED_AT_CLIENT')
  AND b."deletedAt" IS NULL
ORDER BY b."startDate" DESC;
```

Ça liste tous les trajets en limbo. Si la liste est vide → rien à faire.

## Étape 2 — Cleanup (idempotent)

Une fois la liste auditée, exécuter ce bloc (idempotent — peut tourner
plusieurs fois sans dommage) :

```sql
-- Patch les TaxiTrip OUTBOUND/STANDALONE sur résa COMPLETED → ARRIVED_AT_PENSION
WITH affected_trips AS (
  SELECT t.id, t.status AS old_status
  FROM "TaxiTrip" t
  JOIN "Booking" b ON t."bookingId" = b.id
  WHERE
    b.status = 'COMPLETED'
    AND t."tripType" IN ('OUTBOUND', 'STANDALONE')
    AND t.status NOT IN ('ARRIVED_AT_PENSION', 'ARRIVED_AT_CLIENT')
    AND b."deletedAt" IS NULL
),
trip_update AS (
  UPDATE "TaxiTrip" t
  SET
    status = 'ARRIVED_AT_PENSION',
    "trackingActive" = false,
    "trackingToken" = NULL
  FROM affected_trips a
  WHERE t.id = a.id
  RETURNING t.id, a.old_status
)
INSERT INTO "TaxiStatusHistory" ("taxiTripId", status, "updatedBy")
SELECT
  tu.id,
  'ARRIVED_AT_PENSION',
  'sql-cleanup-retroactive-2026-05-19' -- marker pour audit
FROM trip_update tu;

-- Patch les TaxiTrip RETURN sur résa COMPLETED → ARRIVED_AT_CLIENT
WITH affected_trips AS (
  SELECT t.id, t.status AS old_status
  FROM "TaxiTrip" t
  JOIN "Booking" b ON t."bookingId" = b.id
  WHERE
    b.status = 'COMPLETED'
    AND t."tripType" = 'RETURN'
    AND t.status NOT IN ('ARRIVED_AT_PENSION', 'ARRIVED_AT_CLIENT')
    AND b."deletedAt" IS NULL
),
trip_update AS (
  UPDATE "TaxiTrip" t
  SET
    status = 'ARRIVED_AT_CLIENT',
    "trackingActive" = false,
    "trackingToken" = NULL
  FROM affected_trips a
  WHERE t.id = a.id
  RETURNING t.id, a.old_status
)
INSERT INTO "TaxiStatusHistory" ("taxiTripId", status, "updatedBy")
SELECT
  tu.id,
  'ARRIVED_AT_CLIENT',
  'sql-cleanup-retroactive-2026-05-19'
FROM trip_update tu;
```

## Étape 3 — Vérification

Relancer la query de l'Étape 1. Doit retourner 0 rows.

## Notes

- Aucun SMS n'est envoyé par ce cleanup (write SQL direct, pas via API).
- Le `updatedBy='sql-cleanup-retroactive-2026-05-19'` n'est pas un userId
  Prisma valide — c'est volontaire, ça marque l'historique pour qu'un
  audit ultérieur puisse identifier les rows touchées par cette opération.
- Tracking GPS désactivé + token nullifié → si quelqu'un avait un lien
  SMS de tracking en cache pour ce trip, il tombe en 404 (sécurité).
