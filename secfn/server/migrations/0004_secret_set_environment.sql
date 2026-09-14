-- PostgreSQL 15+: apply to the explicit deployment schema, or the sole matching table.
BEGIN;
DO $$
DECLARE deployment_schema text := nullif(current_setting('secfn.migration_schema', true), '');
BEGIN
  IF deployment_schema IS NULL THEN
    SELECT n.nspname INTO STRICT deployment_schema
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'secfn_secret_sets' AND c.relkind = 'r'
      AND n.nspname NOT IN ('pg_catalog', 'information_schema');
  END IF;
  EXECUTE format('ALTER TABLE %I.secfn_secret_sets ADD COLUMN IF NOT EXISTS environment_id text', deployment_schema);
  EXECUTE format('DROP INDEX IF EXISTS %I.idx_secfn_secret_sets_lookup', deployment_schema);
  EXECUTE format('CREATE UNIQUE INDEX idx_secfn_secret_sets_lookup ON %I.secfn_secret_sets (tenant_id, namespace_id, environment_id, name) NULLS NOT DISTINCT', deployment_schema);
END $$;
COMMIT;
