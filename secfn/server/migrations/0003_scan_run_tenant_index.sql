-- PostgreSQL: upgrade schema 2 to 3 in the schema containing the resolved table.
BEGIN;
DO $$
DECLARE deployment_schema text;
BEGIN
  SELECT n.nspname INTO STRICT deployment_schema
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.oid = 'secfn_scan_runs'::regclass;
  EXECUTE format('ALTER TABLE %I.secfn_scan_runs ADD COLUMN IF NOT EXISTS tenant_id text', deployment_schema);
  EXECUTE format('DROP INDEX IF EXISTS %I.idx_secfn_scan_runs_tenant', deployment_schema);
  EXECUTE format('CREATE INDEX idx_secfn_scan_runs_tenant ON %I.secfn_scan_runs (tenant_id)', deployment_schema);
END $$;
COMMIT;
