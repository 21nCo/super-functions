import { describe, it, expect } from 'vitest';
import type { KVStoreAdapter } from '../adapter/types.js';

describe('KVStoreAdapter', () => {
  it('should match spec signature (TV-KVSTORE-001)', () => {
    // Type-level check: this object must satisfy the interface
    const adapter: KVStoreAdapter = {
      async get(key: string) { return 'value'; },
      async set(input: { key: string; value: string; ttlSeconds?: number }) { 
        // Verification that input is an object
        const { key: k, value, ttlSeconds } = input;
      },
      async delete(key: string) { },
      async incr(input: { key: string; by?: number; ttlSeconds?: number }) { return { value: 1 }; }
    };
    
    expect(adapter).toBeDefined();
  });

  it('should allow optional incr (TV-KVSTORE-001 variant)', () => {
    const adapter: KVStoreAdapter = {
      async get(key: string) { return null; },
      async set(input) { },
      async delete(key) { }
    };
    expect(adapter).toBeDefined();
  });
});
