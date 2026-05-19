-- ============================================================================
-- Seed SQL — Stephanie Yanik + Mama (résidente permanente)
-- ============================================================================
--
-- À exécuter dans Supabase SQL Editor APRÈS la migration
-- `20260518_pet_permanent_resident/migration.sql`.
--
-- Idempotent — peut être ré-exécuté sans risque de doublon.  Stephanie est
-- identifiée par son email déterministe `stephanie.yanik+walkin@dog-universe.local`,
-- Mama par son nom + ownerId.
--
-- Usage :
--   1. Ouvrir https://supabase.com/dashboard → project → SQL Editor
--   2. Copier-coller ce fichier
--   3. Run
--   4. Vérifier les SELECTs en fin de script — doivent renvoyer 1 ligne chacun
-- ============================================================================

BEGIN;

-- ── 1. Stephanie Yanik — walk-in client ─────────────────────────────────────
-- Pas de mot de passe loginable. Géré uniquement via admin panel.
INSERT INTO "User" (
  id, email, name, "firstName", "lastName", phone, role, "isWalkIn",
  "passwordHash", "createdAt", "updatedAt"
)
VALUES (
  -- cuid-like deterministic ID for Stephanie (cuid v1 format: 25 chars, starts with c)
  'c_stephanie_yanik_walkin_1',
  'stephanie.yanik+walkin@dog-universe.local',
  'Stephanie Yanik',
  'Stephanie',
  'Yanik',
  '+1 (248) 321-7653',
  'CLIENT',
  true,
  'walkin-no-login-' || md5(random()::text),  -- non-loginable random hash
  NOW(),
  NOW()
)
ON CONFLICT (email) DO UPDATE SET
  -- Idempotent : si elle existe déjà, on s'assure juste qu'elle est bien walk-in.
  "isWalkIn" = true,
  phone = '+1 (248) 321-7653',
  "updatedAt" = NOW()
RETURNING id, name, phone, "isWalkIn";

-- Stephanie's real-world contact email (stephyanik@gmail.com) is stored in
-- an AdminNote rather than User.email — User.email keeps the synthetic
-- walk-in convention used everywhere else in the codebase, but the admin
-- needs the real email for billing receipts and out-of-band communication.
INSERT INTO "AdminNote" (
  id, "entityType", "entityId", "createdBy", content, "createdAt"
)
SELECT
  'c_stephanie_yanik_contact_note_1',
  'CLIENT',
  u.id,
  u.id, -- self-attributed; admin can edit later
  E'Real-world contact (do not change User.email — walk-in convention):\n• Email: stephyanik@gmail.com\n• Phone: +1 (248) 321-7653\n• Country: USA',
  NOW()
FROM "User" u
WHERE u.email = 'stephanie.yanik+walkin@dog-universe.local'
  AND NOT EXISTS (
    SELECT 1 FROM "AdminNote" n WHERE n.id = 'c_stephanie_yanik_contact_note_1'
  );

-- ── 2. Mama — chienne résidente permanente ──────────────────────────────────
-- Find-or-create : on lookup par (ownerId, name, deletedAt IS NULL) pour
-- éviter le doublon si on relance.
INSERT INTO "Pet" (
  id, "ownerId", name, species, gender, "isNeutered", notes,
  "isPermanentResident", "createdAt", "updatedAt"
)
SELECT
  'c_mama_dog_resident_1',
  u.id,
  'Mama',
  'DOG',
  'FEMALE',
  true,
  'Blanche avec taches marron. Stérilisée, identifiée (puce électronique). Résidente permanente — vit à vie à Dog Universe.',
  true,
  NOW(),
  NOW()
FROM "User" u
WHERE u.email = 'stephanie.yanik+walkin@dog-universe.local'
  AND NOT EXISTS (
    SELECT 1 FROM "Pet" p
    WHERE p."ownerId" = u.id
      AND p.name = 'Mama'
      AND p."deletedAt" IS NULL
  )
RETURNING id, name, species, "isPermanentResident";

-- Si Mama existait déjà (re-run), garantir que son flag est bien à true.
UPDATE "Pet" p
SET "isPermanentResident" = true,
    "updatedAt" = NOW()
FROM "User" u
WHERE p."ownerId" = u.id
  AND p.name = 'Mama'
  AND p."deletedAt" IS NULL
  AND u.email = 'stephanie.yanik+walkin@dog-universe.local'
  AND p."isPermanentResident" = false;

COMMIT;

-- ============================================================================
-- Vérification (doivent retourner 1 ligne chacun) :
-- ============================================================================

SELECT
  '✓ Stephanie' AS check_name,
  u.id, u.name, u.email, u."isWalkIn", u.role
FROM "User" u
WHERE u.email = 'stephanie.yanik+walkin@dog-universe.local';

SELECT
  '✓ Mama' AS check_name,
  p.id, p.name, p.species, p.gender, p."isNeutered",
  p."isPermanentResident", u.name AS owner_name
FROM "Pet" p
JOIN "User" u ON p."ownerId" = u.id
WHERE u.email = 'stephanie.yanik+walkin@dog-universe.local'
  AND p.name = 'Mama'
  AND p."deletedAt" IS NULL;
