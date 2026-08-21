import {
  createAdminCapabilityAdapter as createKernelAdminCapabilityAdapter,
  type AdminCapabilityAdapter,
  type AdminOperationContext,
  type AdminOperationRequest,
} from "@superfunctions/admin";
import { plugFnAdminCapability } from "./capability.js";
import type { PlugFnAdminService } from "./types.js";

function bind<TInput, TOutput>(
  handler: (input: TInput, context: AdminOperationContext) => Promise<TOutput>,
) {
  return ({ input, context }: AdminOperationRequest) => handler(input as TInput, context);
}

/** Every advertised PlugFn operation is explicitly bound to a typed domain method. */
export function createPlugFnAdminAdapter(
  service: PlugFnAdminService,
): AdminCapabilityAdapter<typeof plugFnAdminCapability> {
  return createKernelAdminCapabilityAdapter(plugFnAdminCapability, {
    "plugfn.providers.list": bind(service.listProviders),
    "plugfn.providers.get": bind(service.getProvider),
    "plugfn.connections.list": bind(service.listConnections),
    "plugfn.connections.get": bind(service.getConnection),
    "plugfn.connections.authorize": bind(service.authorizeConnection),
    "plugfn.connections.refresh": bind(service.refreshConnection),
    "plugfn.connections.disconnect": bind(service.disconnectConnection),
    "plugfn.provider-installations.list": bind(service.listInstallations),
    "plugfn.provider-installations.get": bind(service.getInstallation),
    "plugfn.provider-installations.disable": bind(service.disableInstallation),
    "plugfn.provider-installations.revoke": bind(service.revokeInstallation),
    "plugfn.workflows.list": bind(service.listWorkflows),
    "plugfn.workflows.get": bind(service.getWorkflow),
    "plugfn.workflows.stats": bind(service.getWorkflowStats),
    "plugfn.workflows.enable": bind(service.enableWorkflow),
    "plugfn.workflows.disable": bind(service.disableWorkflow),
    "plugfn.workflows.delete": bind(service.deleteWorkflow),
    "plugfn.webhook-receipts.get": bind(service.getWebhookReceipt),
    "plugfn.webhook-deliveries.list": bind(service.listWebhookDeliveries),
    "plugfn.sync-jobs.list": bind(service.listSyncJobs),
    "plugfn.sync-jobs.get": bind(service.getSyncJob),
    "plugfn.sync-jobs.run": bind(service.runSync),
    "plugfn.sync-jobs.enqueue": bind(service.enqueueSync),
    "plugfn.sync-jobs.cancel": bind(service.cancelSync),
  });
}

export const createAdminAdapter = createPlugFnAdminAdapter;
