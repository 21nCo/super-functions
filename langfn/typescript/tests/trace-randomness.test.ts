import { expect, it, vi } from 'vitest';
import { LangFn } from '../src/client.js';
import { Tracer } from '../src/observability/tracer.js';
it('rejects missing Web Crypto instead of issuing weak trace identifiers',async()=>{
 vi.stubGlobal('crypto',undefined);
 try {
  expect(()=>new Tracer().createTraceId()).toThrow('Web Crypto');
  await expect(new LangFn({model:'mock'}).complete('test')).rejects.toThrow('Web Crypto');
 } finally {vi.unstubAllGlobals();}
});
