import { createBillFnRouter } from './router.js';
import { getSchema } from './schema.js';
import { createBillFnService } from './service.js';
import type { BillFnConfig, BillFnInstance } from './types.js';

export type * from './types.js';
export { getSchema, getSchemaMap } from './schema.js';
export { createBillFnError, billFnErrorRegistry } from './errors.js';
export { createBillFnReconciliationWorker } from './service.js';

export function createBillFn(config: BillFnConfig): BillFnInstance {
  const service = createBillFnService(config);
  const router = createBillFnRouter(config);

  return {
    router,
    getSchema: () => getSchema({ namespace: config.namespace }),
    getCatalog: service.getCatalog,
    createCheckout: service.createCheckout,
    verifyCheckout: service.verifyCheckout,
    cancelSubscription: service.cancelSubscription,
    changeSubscription: service.changeSubscription,
    resumeSubscription: service.resumeSubscription,
    refundCharge: service.refundCharge,
    syncSubscription: service.syncSubscription,
    restorePurchases: service.restorePurchases,
    getEntitlements: service.getEntitlements,
    getUsage: service.getUsage,
    handleWebhook: service.handleWebhook,
    enqueueReconciliationJob: service.enqueueReconciliationJob,
    getReconciliationJob: service.getReconciliationJob,
    runReconciliationJob: service.runReconciliationJob,
    subscriptionProvider: service.subscriptionProvider,
    quotaProvider: service.quotaProvider
  };
}
