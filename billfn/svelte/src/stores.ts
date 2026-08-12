import type { BillFnClient, BillFnClientErrorEnvelope } from '@billfn/client';
import type { BillableSubject, BillFnEntitlementsResponse } from '@billfn/core';
import { writable, type Readable } from 'svelte/store';

export type BillFnEntitlementsStoreValue = BillFnEntitlementsResponse | BillFnClientErrorEnvelope | null;

export interface BillFnEntitlementsStore extends Readable<BillFnEntitlementsStoreValue> {
  refresh(subject?: BillableSubject): Promise<Exclude<BillFnEntitlementsStoreValue, null>>;
}

export function createBillFnEntitlementsStore(client: BillFnClient): BillFnEntitlementsStore {
  const store = writable<BillFnEntitlementsStoreValue>(null);

  return {
    subscribe: store.subscribe,
    async refresh(subject?: BillableSubject) {
      const query = subject
        ? Object.fromEntries(
            Object.entries(subject)
              .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
          )
        : undefined;
      const response = await client.getEntitlements(query);
      store.set(response);
      return response;
    }
  };
}
