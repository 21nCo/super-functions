/**
 * IndexedDbStorageAdapter.createForNamespace tests
 * TV-NS-020, TV-NS-021
 * Requirements: NS-009
 *
 * NOTE: These tests verify the database name derivation logic.
 * The actual IndexedDB constructor call requires a browser environment,
 * so we verify dbName via the private property.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Mock indexedDB before importing the adapter
const originalIndexedDb = globalThis.indexedDB;
beforeAll(() => {
  // Minimal IDB mock to prevent constructor errors
  const mockStore = {
    createIndex: vi.fn(),
    indexNames: { contains: () => false },
  };
  const mockDb = {
    createObjectStore: vi.fn(() => mockStore),
    objectStoreNames: { contains: () => false },
    transaction: vi.fn(),
    close: vi.fn(),
  };
  const mockRequest = {
    result: mockDb,
    error: null,
    onerror: null as any,
    onsuccess: null as any,
    onupgradeneeded: null as any,
  };
  (globalThis as any).indexedDB = {
    open: vi.fn(() => {
      // Fire onsuccess asynchronously
      setTimeout(() => {
        if (mockRequest.onupgradeneeded) {
          mockRequest.onupgradeneeded({ target: { result: mockDb } });
        }
        if (mockRequest.onsuccess) {
          mockRequest.onsuccess({ target: { result: mockDb } });
        }
      }, 0);
      return mockRequest;
    }),
  };
});

afterAll(() => {
  if (originalIndexedDb === undefined) {
    delete (globalThis as { indexedDB?: IDBFactory }).indexedDB;
  } else {
    globalThis.indexedDB = originalIndexedDb;
  }
});

import { IndexedDbStorageAdapter } from "../src/adapters/indexedDbStorage.js";

describe("IndexedDbStorageAdapter.createForNamespace (NS-009)", () => {
  // TV-NS-020: namespace with colons
  it("TV-NS-020: sanitizes colons in namespace to underscores", () => {
    const adapter = IndexedDbStorageAdapter.createForNamespace("app", "org:user-1");
    expect((adapter as any).dbName).toBe("app_org_user-1");
  });

  // TV-NS-021: simple namespace without colons
  it("TV-NS-021: simple namespace without colons", () => {
    const adapter = IndexedDbStorageAdapter.createForNamespace("app", "user-1");
    expect((adapter as any).dbName).toBe("app_user-1");
  });
});
