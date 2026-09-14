import { expect, it } from 'vitest';
import { stableSerializeCachePayload } from '../src/utils/cache-keys.js';
it('preserves locale-independent key order and existing serialized cache identities',()=>{
 expect(stableSerializeCachePayload({'é':1,'a':2,'Z':3,'😀':4,'\uE000':5})).toBe('{"Z":3,"a":2,"é":1,"😀":4,"\uE000":5}');
});
