import {
  createCapabilityAdminClient,
  type AdminClient,
  type AdminClientRequestOptions,
} from "@superfunctions/admin";
import { plugFnAdminCapability } from "./capability.js";
import type {
  PlugFnAuthorizeConnectionInput,
  PlugFnCancelSyncInput,
  PlugFnConnectionListInput,
  PlugFnConnectionTargetInput,
  PlugFnInstallationListInput,
  PlugFnInstallationTargetInput,
  PlugFnProviderListInput,
  PlugFnRunSyncInput,
  PlugFnSyncJobListInput,
  PlugFnWebhookDeliveryListInput,
  PlugFnWebhookReceiptGetInput,
  PlugFnWorkflowListInput,
  PlugFnWorkflowTargetInput,
} from "./types.js";

/** Function-scoped client with named, domain-specific PlugFn administration methods. */
export function createPlugFnAdminClient(adminClient: AdminClient) {
  const client = createCapabilityAdminClient(plugFnAdminCapability, adminClient);
  return Object.assign(client, {
    providers: {
      list: (input: PlugFnProviderListInput = {}, options?: AdminClientRequestOptions) => client.invoke("plugfn.providers.list", input, options),
      get: (id: string, options?: AdminClientRequestOptions) => client.invoke("plugfn.providers.get", { id }, options),
    },
    connections: {
      list: (input: PlugFnConnectionListInput = {}, options?: AdminClientRequestOptions) => client.invoke("plugfn.connections.list", input, options),
      get: (id: string, options?: AdminClientRequestOptions) => client.invoke("plugfn.connections.get", { id }, options),
      authorize: (input: PlugFnAuthorizeConnectionInput, options?: AdminClientRequestOptions) => client.invoke("plugfn.connections.authorize", input, options),
      refresh: (input: PlugFnConnectionTargetInput, options?: AdminClientRequestOptions) => client.invoke("plugfn.connections.refresh", input, options),
      disconnect: (input: PlugFnConnectionTargetInput, options?: AdminClientRequestOptions) => client.invoke("plugfn.connections.disconnect", input, options),
    },
    installations: {
      list: (input: PlugFnInstallationListInput = {}, options?: AdminClientRequestOptions) => client.invoke("plugfn.provider-installations.list", input, options),
      get: (input: PlugFnInstallationTargetInput, options?: AdminClientRequestOptions) => client.invoke("plugfn.provider-installations.get", input, options),
      disable: (input: PlugFnInstallationTargetInput, options?: AdminClientRequestOptions) => client.invoke("plugfn.provider-installations.disable", input, options),
      revoke: (input: PlugFnInstallationTargetInput, options?: AdminClientRequestOptions) => client.invoke("plugfn.provider-installations.revoke", input, options),
    },
    workflows: {
      list: (input: PlugFnWorkflowListInput = {}, options?: AdminClientRequestOptions) => client.invoke("plugfn.workflows.list", input, options),
      get: (input: PlugFnWorkflowTargetInput, options?: AdminClientRequestOptions) => client.invoke("plugfn.workflows.get", input, options),
      stats: (input: PlugFnWorkflowTargetInput, options?: AdminClientRequestOptions) => client.invoke("plugfn.workflows.stats", input, options),
      enable: (input: PlugFnWorkflowTargetInput, options?: AdminClientRequestOptions) => client.invoke("plugfn.workflows.enable", input, options),
      disable: (input: PlugFnWorkflowTargetInput, options?: AdminClientRequestOptions) => client.invoke("plugfn.workflows.disable", input, options),
      delete: (input: PlugFnWorkflowTargetInput, options?: AdminClientRequestOptions) => client.invoke("plugfn.workflows.delete", input, options),
    },
    webhooks: {
      getReceipt: (input: PlugFnWebhookReceiptGetInput, options?: AdminClientRequestOptions) => client.invoke("plugfn.webhook-receipts.get", input, options),
      listDeliveries: (input: PlugFnWebhookDeliveryListInput, options?: AdminClientRequestOptions) => client.invoke("plugfn.webhook-deliveries.list", input, options),
    },
    syncJobs: {
      list: (input: PlugFnSyncJobListInput = {}, options?: AdminClientRequestOptions) => client.invoke("plugfn.sync-jobs.list", input, options),
      get: (id: string, options?: AdminClientRequestOptions) => client.invoke("plugfn.sync-jobs.get", { id }, options),
      run: (input: PlugFnRunSyncInput, options?: AdminClientRequestOptions) => client.invoke("plugfn.sync-jobs.run", input, options),
      enqueue: (input: PlugFnRunSyncInput, options?: AdminClientRequestOptions) => client.invoke("plugfn.sync-jobs.enqueue", input, options),
      cancel: (input: PlugFnCancelSyncInput, options?: AdminClientRequestOptions) => client.invoke("plugfn.sync-jobs.cancel", input, options),
    },
  });
}
