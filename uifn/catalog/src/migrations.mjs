import { migrateV0ToV1 } from '../migrations/v0-to-v1.mjs';

const migrations = new Map([[0, { to: 1, id: 'catalog-v0-to-v1', migrate: migrateV0ToV1 }]]);

export function migrateCatalogDocument(input, targetVersion = 1) {
  let document = structuredClone(input);
  const applied = [];
  if (!Number.isInteger(document?.schemaVersion)) {
    return { ok: false, document, applied, failures: [{ code: 'UIFN_CATALOG_SCHEMA_VERSION_MISSING' }] };
  }
  if (document.schemaVersion > targetVersion) {
    return { ok: false, document, applied, failures: [{ code: 'UIFN_CATALOG_SCHEMA_VERSION_UNSUPPORTED', actual: document.schemaVersion, target: targetVersion }] };
  }
  while (document.schemaVersion < targetVersion) {
    const migration = migrations.get(document.schemaVersion);
    if (!migration) {
      return { ok: false, document, applied, failures: [{ code: 'UIFN_CATALOG_MIGRATION_MISSING', from: document.schemaVersion, target: targetVersion }] };
    }
    try {
      document = migration.migrate(document);
      applied.push(migration.id);
    } catch (error) {
      return { ok: false, document, applied, failures: [{ code: error.code ?? 'UIFN_CATALOG_MIGRATION_FAILED', message: error.message }] };
    }
  }
  return { ok: true, document, applied, failures: [] };
}
