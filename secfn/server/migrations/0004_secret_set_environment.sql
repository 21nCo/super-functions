-- PostgreSQL 15+: apply to the explicit deployment schema, or the sole matching table.
BEGIN;
DO $$
DECLARE duplicate_groups bigint;
        deployment_schema text := nullif(current_setting('secfn.migration_schema', true), '');
BEGIN
  IF deployment_schema IS NULL THEN
    SELECT n.nspname INTO STRICT deployment_schema
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'secfn_secret_sets' AND c.relkind = 'r'
      AND n.nspname NOT IN ('pg_catalog', 'information_schema');
  END IF;
  EXECUTE format('ALTER TABLE %I.secfn_secret_sets ADD COLUMN IF NOT EXISTS environment_id text', deployment_schema);
  EXECUTE format('SELECT count(*) FROM (SELECT 1 FROM %I.secfn_secret_sets GROUP BY tenant_id, namespace_id, environment_id, name HAVING count(*) > 1) duplicates', deployment_schema) INTO duplicate_groups;
  IF duplicate_groups > 0 THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'SecFn schema 4 has duplicate secret-set identities', HINT = 'Preserve each set and its members: rename conflicting sets to their own unique IDs, or choose distinct names after inspecting their members. See secfn/server/README.md migration remediation. Then rerun this migration.';
  END IF;
  EXECUTE format('DROP INDEX IF EXISTS %I.idx_secfn_secret_sets_lookup', deployment_schema);
  EXECUTE format('CREATE UNIQUE INDEX idx_secfn_secret_sets_lookup ON %I.secfn_secret_sets (tenant_id, namespace_id, environment_id, name) NULLS NOT DISTINCT', deployment_schema);
END $$;
COMMIT;
