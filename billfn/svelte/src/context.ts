import type { BillFnClient } from '@billfn/client';
import { getContext, setContext } from 'svelte';

const BILLFN_CLIENT_CONTEXT = Symbol('billfn-client');

export function createBillFnClientContext(client: BillFnClient): { client: BillFnClient } {
  const value = { client };
  setContext(BILLFN_CLIENT_CONTEXT, value);
  return value;
}

export function getBillFnClientContext(): { client: BillFnClient } {
  const value = getContext<{ client: BillFnClient } | undefined>(BILLFN_CLIENT_CONTEXT);
  if (!value) {
    throw new Error(
      '@billfn/svelte: BillFn client context is not set. Call createBillFnClientContext() in a parent component first.'
    );
  }
  return value;
}
