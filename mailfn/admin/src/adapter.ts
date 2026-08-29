import {
  createAdminCapabilityAdapter as createKernelAdminCapabilityAdapter,
  type AdminCapabilityAdapter,
  type AdminOperationContext,
  type AdminOperationRequest,
} from "@superfunctions/admin";
import { mailFnAdminCapability } from "./index.js";
import type { MailFnAdminService } from "./types.js";

function bind<TInput>(
  receiver: MailFnAdminService,
  handler: (input: TInput, context: AdminOperationContext) => unknown,
) {
  return ({ input, context }: AdminOperationRequest) => handler.call(receiver, input as TInput, context);
}

/** Maps each declared MailFn operation to one explicit domain method. */
export function createMailFnAdminAdapter(
  service: MailFnAdminService,
): AdminCapabilityAdapter<typeof mailFnAdminCapability> {
  return createKernelAdminCapabilityAdapter(mailFnAdminCapability, {
    "mailfn.projects.list": bind(service, service.listProjects),
    "mailfn.projects.get": bind(service, service.getProject),
    "mailfn.inboxes.list": bind(service, service.listInboxes),
    "mailfn.inboxes.get": bind(service, service.getInbox),
    "mailfn.messages.list": bind(service, service.listMessages),
    "mailfn.messages.get": bind(service, service.getMessage),
    "mailfn.threads.list": bind(service, service.listThreads),
    "mailfn.threads.get": bind(service, service.getThread),
    "mailfn.drafts.list": bind(service, service.listDrafts),
    "mailfn.drafts.get": bind(service, service.getDraft),
    "mailfn.attachments.list": bind(service, service.listAttachments),
    "mailfn.attachments.get": bind(service, service.getAttachment),
    "mailfn.credentials.list": bind(service, service.listCredentials),
    "mailfn.credentials.get": bind(service, service.getCredential),
    "mailfn.domains-routes.list": bind(service, service.listDomains),
    "mailfn.domains-routes.get": bind(service, service.getDomain),
    "mailfn.webhooks.list": bind(service, service.listWebhooks),
    "mailfn.webhooks.get": bind(service, service.getWebhook),
    "mailfn.retention.list": bind(service, service.listRetention),
    "mailfn.retention.get": bind(service, service.getRetention),
    "mailfn.quotas.list": bind(service, service.listQuotas),
    "mailfn.quotas.get": bind(service, service.getQuota),
    "mailfn.compliance-audit.list": bind(service, service.listAuditEvents),
    "mailfn.compliance-audit.get": bind(service, service.getAuditEvent),
    "mailfn.inboxes.create-inbox": bind(service, service.createInbox),
    "mailfn.inboxes.expire-inbox": bind(service, service.expireInbox),
    "mailfn.messages.label-message": bind(service, service.labelMessage),
    "mailfn.drafts.send-draft": bind(service, service.sendDraft),
    "mailfn.messages.reply-draft": bind(service, service.createReplyDraft),
    "mailfn.domains-routes.manage-domain": bind(service, service.manageDomain),
    "mailfn.webhooks.create-webhook": bind(service, service.createWebhook),
    "mailfn.credentials.rotate-credential": bind(service, service.rotateCredential),
    "mailfn.retention.purge": bind(service, service.purgeRetention),
  });
}

export const createAdminAdapter = createMailFnAdminAdapter;
