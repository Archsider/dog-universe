-- Pet.isPermanentResident — flag pour les animaux résidents permanents
-- (cas Stephanie/Mama, mai 2026).
--
-- Un résident permanent :
--   - vit à demeure chez Dog Universe (pension à vie)
--   - est exclu des KPIs d'occupancy standard (compteurs "chiens présents"
--     dans le dashboard) car ce n'est pas un séjour facturé à la nuit
--   - apparaît avec un badge visuel distinct dans l'UI admin
--
-- Pour mettre/retirer le flag : interface admin sur la fiche pet
-- (PATCH /api/admin/pets/[id]).

ALTER TABLE "Pet"
  ADD COLUMN IF NOT EXISTS "isPermanentResident" BOOLEAN NOT NULL DEFAULT false;

-- Index partiel : il y aura toujours très peu de résidents permanents
-- (Mama est la première). Index partiel = quasi-gratuit en stockage mais
-- ultra-rapide pour les queries "list permanent residents".
CREATE INDEX IF NOT EXISTS "Pet_isPermanentResident_idx"
  ON "Pet" ("isPermanentResident")
  WHERE "isPermanentResident" = true;
