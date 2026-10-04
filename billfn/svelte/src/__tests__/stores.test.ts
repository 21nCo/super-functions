import { describe, expect, it } from 'vitest';
import { createBillFnClient } from '@billfn/client';
import { createBillFnEntitlementsStore } from '../index.js';

describe('BillFn entitlements store', () => {
  it('keeps the last settled state while loading, recovers from errors and stops notifying unsubscribed readers', async () => {
    const urls: string[] = [];
    const responses = [
      { ok: true, data: { entitlements: [] } },
      { ok: false, error: { code: 'BILLFN_NOT_FOUND', message: 'No billing account' } },
      { ok: true, data: { entitlements: [] } }
    ];
    let complete!: () => void;
    const client = createBillFnClient({
      baseUrl: 'https://billing.example.test/billfn',
      fetch: (input) => {
        urls.push(String(input));
        return new Promise<Response>((resolve) => {
          complete = () => resolve(new Response(JSON.stringify(responses.shift()), {
            status: urls.length === 2 ? 404 : 200,
            headers: { 'content-type': 'application/json' }
          }));
        });
      }
    });
    const store = createBillFnEntitlementsStore(client);
    const states: Array<boolean | null> = [];
    const unsubscribe = store.subscribe((value) => states.push(value?.ok ?? null));
    try {
      const first = store.refresh({ principalId: 'user & 1', tenantId: undefined });
      expect(states).toEqual([null]);
      expect(new URL(urls[0]).searchParams.get('principalId')).toBe('user & 1');
      expect(new URL(urls[0]).searchParams.has('tenantId')).toBe(false);
      complete();
      await first;
      expect(states).toEqual([null, true]);
      const failed = store.refresh();
      expect(states).toEqual([null, true]);
      complete();
      await failed;
      expect(states).toEqual([null, true, false]);
      unsubscribe();
      const recovered: Array<boolean | null> = [];
      const stop = store.subscribe((value) => recovered.push(value?.ok ?? null));
      try {
        const pending = store.refresh();
        expect(recovered).toEqual([false]);
        complete();
        await pending;
        expect(recovered).toEqual([false, true]);
        expect(states).toEqual([null, true, false]);
      } finally {
        stop();
      }
    } finally {
      unsubscribe();
    }
  });
});
