-- Drop multi-tenant scaffolding.
-- La table Tenant n'a jamais été référencée par d'autres modèles
-- (aucune FK tenantId posée). Suppression non destructive pour les
-- données métier — seule la row 'default' est perdue.
--
-- Si la migration 20260510_tenant_scaffold n'a jamais été exécutée
-- sur cette base, DROP TABLE IF EXISTS no-op proprement.

DROP TABLE IF EXISTS "Tenant" CASCADE;

INSERT INTO "_app_migrations"(name) VALUES ('20260512_drop_tenant_scaffold')
  ON CONFLICT DO NOTHING;
