import { expect, it, vi } from 'vitest';
import { createCompletionCacheKey, stableSerializeCachePayload } from '../src/utils/cache-keys.js';
it('preserves locale-independent key order and existing serialized cache identities',()=>{
 expect(stableSerializeCachePayload({'é':1,'a':2,'Z':3,'😀':4,'\uE000':5})).toBe('{"Z":3,"a":2,"é":1,"😀":4,"\uE000":5}');
});
it('hashes cache identities without relying on global Web Crypto', async () => {
 const input = {provider:'mock',model:'model',prompt:'hello'};
 const expected = await createCompletionCacheKey(input);
 vi.stubGlobal('crypto', undefined);
 try {
  await expect(createCompletionCacheKey(input)).resolves.toBe(expected);
 } finally { vi.unstubAllGlobals(); }
});
