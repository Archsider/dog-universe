DROP TRIGGER IF EXISTS lifetime_contract_set_updated_at ON "LifetimeContract";
DROP FUNCTION IF EXISTS update_lifetime_contract_updated_at();
DROP TABLE IF EXISTS "LifetimeContract";
DROP TYPE IF EXISTS "LifetimeContractStatus";
DELETE FROM "_app_migrations" WHERE name = '20260519_lifetime_contract';
