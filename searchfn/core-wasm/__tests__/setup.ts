import { IDBKeyRange, indexedDB } from "fake-indexeddb";

const globalObject = globalThis as unknown as {
  indexedDB: typeof indexedDB;
  IDBKeyRange: typeof IDBKeyRange;
};

globalObject.indexedDB = indexedDB;
globalObject.IDBKeyRange = IDBKeyRange;
