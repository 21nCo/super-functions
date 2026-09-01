import {
  createCapabilityAdminClient,
  type AdminClient,
  type AdminClientRequestOptions,
} from "@superfunctions/admin";
import { mailFnAdminCapability, type MailFnAdminOperationId } from "./index.js";
import type {
  MailFnCreateInboxInput,
  MailFnCreateWebhookInput,
  MailFnGetInput,
  MailFnItemOutput,
  MailFnLabelMessageInput,
  MailFnListInput,
  MailFnListOutput,
  MailFnManageDomainInput,
  MailFnMutationOutput,
  MailFnReplyDraftInput,
} from "./types.js";

function readResource(
  adminClient: AdminClient,
  listOperation: Extract<MailFnAdminOperationId, `${string}.list`>,
  getOperation: Extract<MailFnAdminOperationId, `${string}.get`>,
) {
  return {
    list: (input: MailFnListInput = {}, options?: AdminClientRequestOptions) =>
      adminClient.invokeOperation<MailFnListOutput>(listOperation, input, options),
    get: (input: MailFnGetInput, options?: AdminClientRequestOptions) =>
      adminClient.invokeOperation<MailFnItemOutput>(getOperation, input, options),
  };
}

/** MailFn-scoped TypeScript client with one named method per manifest operation. */
export function createMailFnAdminClient(adminClient: AdminClient) {
  const client = createCapabilityAdminClient(mailFnAdminCapability, adminClient);
  return Object.assign(client, {
    projects: readResource(adminClient, "mailfn.projects.list", "mailfn.projects.get"),
    inboxes: {
      ...readResource(adminClient, "mailfn.inboxes.list", "mailfn.inboxes.get"),
      create: (input: MailFnCreateInboxInput, options?: AdminClientRequestOptions) =>
        adminClient.invokeOperation<MailFnMutationOutput>("mailfn.inboxes.create-inbox", input, options),
      expire: (input: MailFnGetInput, options?: AdminClientRequestOptions) =>
        adminClient.invokeOperation<MailFnMutationOutput>("mailfn.inboxes.expire-inbox", input, options),
    },
    messages: {
      ...readResource(adminClient, "mailfn.messages.list", "mailfn.messages.get"),
      label: (input: MailFnLabelMessageInput, options?: AdminClientRequestOptions) =>
        adminClient.invokeOperation<MailFnMutationOutput>("mailfn.messages.label-message", input, options),
      createReplyDraft: (input: MailFnReplyDraftInput, options?: AdminClientRequestOptions) =>
        adminClient.invokeOperation<MailFnMutationOutput>("mailfn.messages.reply-draft", input, options),
    },
    threads: readResource(adminClient, "mailfn.threads.list", "mailfn.threads.get"),
    drafts: {
      ...readResource(adminClient, "mailfn.drafts.list", "mailfn.drafts.get"),
      send: (input: MailFnGetInput, options?: AdminClientRequestOptions) =>
        adminClient.invokeOperation<MailFnMutationOutput>("mailfn.drafts.send-draft", input, options),
    },
    attachments: readResource(adminClient, "mailfn.attachments.list", "mailfn.attachments.get"),
    credentials: {
      ...readResource(adminClient, "mailfn.credentials.list", "mailfn.credentials.get"),
      rotate: (input: MailFnGetInput, options?: AdminClientRequestOptions) =>
        adminClient.invokeOperation<MailFnMutationOutput>("mailfn.credentials.rotate-credential", input, options),
    },
    domains: {
      ...readResource(adminClient, "mailfn.domains-routes.list", "mailfn.domains-routes.get"),
      manage: (input: MailFnManageDomainInput, options?: AdminClientRequestOptions) =>
        adminClient.invokeOperation<MailFnMutationOutput>("mailfn.domains-routes.manage-domain", input, options),
    },
    webhooks: {
      ...readResource(adminClient, "mailfn.webhooks.list", "mailfn.webhooks.get"),
      create: (input: MailFnCreateWebhookInput, options?: AdminClientRequestOptions) =>
        adminClient.invokeOperation<MailFnMutationOutput>("mailfn.webhooks.create-webhook", input, options),
    },
    retention: {
      ...readResource(adminClient, "mailfn.retention.list", "mailfn.retention.get"),
      purge: (input: MailFnGetInput, options?: AdminClientRequestOptions) =>
        adminClient.invokeOperation<MailFnMutationOutput>("mailfn.retention.purge", input, options),
    },
    quotas: readResource(adminClient, "mailfn.quotas.list", "mailfn.quotas.get"),
    auditEvents: readResource(adminClient, "mailfn.compliance-audit.list", "mailfn.compliance-audit.get"),
  });
}
