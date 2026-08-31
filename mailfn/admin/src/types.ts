import type {
  AdminOperationContext,
  AdminOperationResult,
} from "@superfunctions/admin";

export type MailFnAdminRecord = Record<string, unknown>;

export interface MailFnListInput {
  cursor?: string;
  limit?: number;
  search?: string;
  filter?: MailFnAdminRecord;
  sort?: readonly MailFnAdminRecord[];
}
export interface MailFnGetInput { id: string }
export interface MailFnCreateInboxInput {
  payload: {
    kind: "stable" | "expiring";
    requestedLocalPart?: string;
    domain?: string;
    displayName?: string;
    expirySeconds?: number;
    metadata?: Record<string, string>;
  };
}
export interface MailFnLabelMessageInput {
  id: string;
  payload: { labels: string[] };
}
export interface MailFnReplyDraftInput {
  id: string;
  payload?: { text?: string; html?: string; replyAll?: boolean };
}
export interface MailFnManageDomainInput {
  id: string;
  payload: { mode: "verify" | "disable" };
}
export interface MailFnCreateWebhookInput {
  payload: { inboxId?: string; url: string; eventTypes: string[] };
}

export interface MailFnListOutput {
  items: MailFnAdminRecord[];
  nextCursor: string | null;
}
export interface MailFnItemOutput { item: MailFnAdminRecord }
export interface MailFnMutationOutput {
  accepted: true;
  item?: MailFnAdminRecord;
  operationReference?: string;
}

type Result<T> = Promise<AdminOperationResult<T>> | AdminOperationResult<T>;

/** Explicit domain contract for every operation in the MailFn admin manifest. */
export interface MailFnAdminService {
  listProjects(input: MailFnListInput, context: AdminOperationContext): Result<MailFnListOutput>;
  getProject(input: MailFnGetInput, context: AdminOperationContext): Result<MailFnItemOutput>;
  listInboxes(input: MailFnListInput, context: AdminOperationContext): Result<MailFnListOutput>;
  getInbox(input: MailFnGetInput, context: AdminOperationContext): Result<MailFnItemOutput>;
  listMessages(input: MailFnListInput, context: AdminOperationContext): Result<MailFnListOutput>;
  getMessage(input: MailFnGetInput, context: AdminOperationContext): Result<MailFnItemOutput>;
  listThreads(input: MailFnListInput, context: AdminOperationContext): Result<MailFnListOutput>;
  getThread(input: MailFnGetInput, context: AdminOperationContext): Result<MailFnItemOutput>;
  listDrafts(input: MailFnListInput, context: AdminOperationContext): Result<MailFnListOutput>;
  getDraft(input: MailFnGetInput, context: AdminOperationContext): Result<MailFnItemOutput>;
  listAttachments(input: MailFnListInput, context: AdminOperationContext): Result<MailFnListOutput>;
  getAttachment(input: MailFnGetInput, context: AdminOperationContext): Result<MailFnItemOutput>;
  listCredentials(input: MailFnListInput, context: AdminOperationContext): Result<MailFnListOutput>;
  getCredential(input: MailFnGetInput, context: AdminOperationContext): Result<MailFnItemOutput>;
  listDomains(input: MailFnListInput, context: AdminOperationContext): Result<MailFnListOutput>;
  getDomain(input: MailFnGetInput, context: AdminOperationContext): Result<MailFnItemOutput>;
  listWebhooks(input: MailFnListInput, context: AdminOperationContext): Result<MailFnListOutput>;
  getWebhook(input: MailFnGetInput, context: AdminOperationContext): Result<MailFnItemOutput>;
  listRetention(input: MailFnListInput, context: AdminOperationContext): Result<MailFnListOutput>;
  getRetention(input: MailFnGetInput, context: AdminOperationContext): Result<MailFnItemOutput>;
  listQuotas(input: MailFnListInput, context: AdminOperationContext): Result<MailFnListOutput>;
  getQuota(input: MailFnGetInput, context: AdminOperationContext): Result<MailFnItemOutput>;
  listAuditEvents(input: MailFnListInput, context: AdminOperationContext): Result<MailFnListOutput>;
  getAuditEvent(input: MailFnGetInput, context: AdminOperationContext): Result<MailFnItemOutput>;
  createInbox(input: MailFnCreateInboxInput, context: AdminOperationContext): Result<MailFnMutationOutput>;
  expireInbox(input: MailFnGetInput, context: AdminOperationContext): Result<MailFnMutationOutput>;
  labelMessage(input: MailFnLabelMessageInput, context: AdminOperationContext): Result<MailFnMutationOutput>;
  sendDraft(input: MailFnGetInput, context: AdminOperationContext): Result<MailFnMutationOutput>;
  createReplyDraft(input: MailFnReplyDraftInput, context: AdminOperationContext): Result<MailFnMutationOutput>;
  manageDomain(input: MailFnManageDomainInput, context: AdminOperationContext): Result<MailFnMutationOutput>;
  createWebhook(input: MailFnCreateWebhookInput, context: AdminOperationContext): Result<MailFnMutationOutput>;
  rotateCredential(input: MailFnGetInput, context: AdminOperationContext): Result<MailFnMutationOutput>;
  purgeRetention(input: MailFnGetInput, context: AdminOperationContext): Result<MailFnMutationOutput>;
}
