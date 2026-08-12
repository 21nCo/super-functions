import { createBillFnHttpClient } from './http-client.js';
import type { BillFnClient, BillFnClientOptions } from './types.js';

export type * from './types.js';

export function createBillFnClient(options: BillFnClientOptions = {}): BillFnClient {
  const http = createBillFnHttpClient(options);

  return {
    getCatalog: () =>
      http.requestJson({
        method: 'GET',
        path: '/catalog'
      }),
    getEntitlements: (query) =>
      http.requestJson({
        method: 'GET',
        path: '/entitlements',
        query
      }),
    getUsage: (query) =>
      http.requestJson({
        method: 'GET',
        path: '/usage',
        query
      }),
    createCheckout: (input) =>
      http.requestJson({
        method: 'POST',
        path: '/checkouts',
        body: input
      }),
    verifyCheckout: (input) =>
      http.requestJson({
        method: 'POST',
        path: '/checkouts/verify',
        body: input
      }),
    cancelSubscription: (input) =>
      http.requestJson({
        method: 'POST',
        path: '/subscriptions/cancel',
        body: input
      }),
    changeSubscription: (input) =>
      http.requestJson({
        method: 'POST',
        path: '/subscriptions/change',
        body: input
      }),
    resumeSubscription: (input) =>
      http.requestJson({
        method: 'POST',
        path: '/subscriptions/resume',
        body: input
      }),
    refundCharge: (input) =>
      http.requestJson({
        method: 'POST',
        path: '/subscriptions/refund',
        body: input
      }),
    syncSubscription: (input) =>
      http.requestJson({
        method: 'POST',
        path: '/subscriptions/sync',
        body: input
      }),
    restorePurchases: (input) =>
      http.requestJson({
        method: 'POST',
        path: '/purchases/restore',
        body: input
      }),
    enqueueReconciliationJob: (input) =>
      http.requestJson({
        method: 'POST',
        path: '/ops/reconciliation/jobs',
        body: input
      }),
    getReconciliationJob: (jobId) =>
      http.requestJson({
        method: 'GET',
        path: `/ops/reconciliation/jobs/${encodeURIComponent(jobId)}`
      }),
    runReconciliationJob: (jobId) =>
      http.requestJson({
        method: 'POST',
        path: `/ops/reconciliation/jobs/${encodeURIComponent(jobId)}/run`
      })
  };
}
