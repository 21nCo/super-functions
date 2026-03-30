export function getIndexedDB(): IDBFactory {
  if (typeof indexedDB !== "undefined") {
    return indexedDB;
  }

  const globalIndexedDb = (globalThis as unknown as { indexedDB?: IDBFactory })?.indexedDB;
  if (globalIndexedDb) {
    return globalIndexedDb;
  }

  throw new Error(
    "IndexedDB is not available in the current environment. Provide a polyfill such as 'fake-indexeddb' when running in Node.js."
  );
}
