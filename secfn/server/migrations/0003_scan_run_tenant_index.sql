-- PostgreSQL: upgrade SecFn schema 2 to 3 after the tenant_id column migration.
CREATE INDEX IF NOT EXISTS idx_secfn_scan_runs_tenant ON secfn_scan_runs (tenant_id);
