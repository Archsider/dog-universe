-- Multi-tenant scaffolding — NON destructif.
-- Crée la table Tenant avec une row 'default' pour permettre aux migrations
-- futures d'ajouter `tenantId` (FK) sur User/Booking/Invoice sans data manquante.
--
-- Ne touche PAS aux tables existantes.

CREATE TABLE IF NOT EXISTS "Tenant" (
  "id"        TEXT NOT NULL PRIMARY KEY,
  "slug"      TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "Tenant_slug_key" ON "Tenant"("slug");

INSERT INTO "Tenant" ("id", "slug", "name")
VALUES ('default', 'default', 'Dog Universe Maroc')
ON CONFLICT ("id") DO NOTHING;
