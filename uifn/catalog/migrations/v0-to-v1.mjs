export function migrateV0ToV1(document) {
  if (document?.schemaVersion !== 0 || !Array.isArray(document?.components)) {
    const error = new Error('Catalog v0 input must contain a components array.');
    error.code = 'UIFN_CATALOG_MIGRATION_INPUT_INVALID';
    throw error;
  }
  const { components, ...rest } = structuredClone(document);
  return {
    ...rest,
    schemaVersion: 1,
    catalogId: rest.catalogId ?? 'uifn-ga-catalog',
    primitives: components,
  };
}
