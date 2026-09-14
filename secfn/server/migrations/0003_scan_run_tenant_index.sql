-- PostgreSQL: upgrade schema 2 to 3; replace any stale named index atomically.
BEGIN;
DROP INDEX IF EXISTS idx_secfn_scan_runs_tenant;
CREATE INDEX idx_secfn_scan_runs_tenant ON secfn_scan_runs (tenant_id);
COMMIT;
