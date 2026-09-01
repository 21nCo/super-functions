import type {
  Actor,
  AbuseCase,
  AttachmentDescriptor,
  AuditEvent,
  ComplianceExport,
  ComplianceProfile,
  CreateCredentialInput,
  Credential,
  CreateDraftInput,
  CreateInboxInput,
  Draft,
  ExtractedVerification,
  Inbox,
  ListMessagesInput,
  MailDomain,
  MailFnEventType,
  Message,
  OperationalAlert,
  OperationalSnapshot,
  Page,
  SenderReputation,
  SupportCase,
  Thread,
  UpdateDraftInput,
  UpdateInboxInput,
  UsageRecord,
  WaitForMessageInput,
  WaitForMessageResult,
  Webhook,
} from '@mailfn/core';
import type { CreatedCredential, CreatedInbox, CreatedWebhook } from '@mailfn/core';

import { MailFnClientError } from './errors.js';

export interface MailFnClientConfig {
  baseUrl: string;
  token: string | (() => string | Promise<string>);
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  retries?: number;
  userAgent?: string;
}

interface Envelope<T> {
  ok: boolean;
  data: T | null;
  error: null | {
    code: string;
    message: string;
    retryable: boolean;
    details?: Record<string, unknown>;
  };
  meta: { requestId: string; version: string };
}

export class MailFnClient {
  private readonly baseUrl: string;
  private readonly fetcher: typeof globalThis.fetch;
  private readonly timeoutMs: number;
  private readonly retries: number;

  public constructor(private readonly config: MailFnClientConfig) {
    this.baseUrl = stripTrailingSlashes(config.baseUrl);
    this.fetcher = config.fetch ?? globalThis.fetch;
    this.timeoutMs = Math.max(1, config.timeoutMs ?? 30_000);
    this.retries = Math.max(0, Math.min(5, config.retries ?? 2));
  }

  public createInbox(input: Omit<CreateInboxInput, 'projectId'>, options?: RequestOptions): Promise<CreatedInbox> {
    return this.request('/v1/inboxes', { method: 'POST', body: input, ...options, idempotent: Boolean(input.idempotencyKey) });
  }

  public listInboxes(options?: RequestOptions): Promise<Inbox[]> {
    return this.request('/v1/inboxes', { ...options });
  }

  public getInbox(inboxId: string, options?: RequestOptions): Promise<Inbox> {
    return this.request(`/v1/inboxes/${segment(inboxId)}`, { ...options });
  }

  public updateInbox(inboxId: string, input: UpdateInboxInput, options?: RequestOptions): Promise<Inbox> {
    return this.request(`/v1/inboxes/${segment(inboxId)}`, { method: 'PATCH', body: input, ...options });
  }

  public deleteInbox(inboxId: string, options?: RequestOptions): Promise<Inbox> {
    return this.request(`/v1/inboxes/${segment(inboxId)}`, { method: 'DELETE', ...options });
  }

  public createToken(inboxId: string, input: Omit<CreateCredentialInput, 'projectId' | 'inboxId'>, options?: RequestOptions): Promise<CreatedCredential> {
    return this.request(`/v1/inboxes/${segment(inboxId)}/tokens`, { method: 'POST', body: input, ...options });
  }

  public revokeToken(inboxId: string, tokenId: string, options?: RequestOptions): Promise<Credential> {
    return this.request(`/v1/inboxes/${segment(inboxId)}/tokens/${segment(tokenId)}`, { method: 'DELETE', ...options });
  }

  public listMessages(inboxId: string, filter: Omit<ListMessagesInput, 'projectId' | 'inboxId'> = {}, options?: RequestOptions): Promise<Page<Message>> {
    return this.request(`/v1/inboxes/${segment(inboxId)}/messages${queryString(filter)}`, { ...options });
  }

  public readMessage(inboxId: string, messageId: string, options?: RequestOptions): Promise<Message> {
    return this.request(`/v1/inboxes/${segment(inboxId)}/messages/${segment(messageId)}`, { ...options });
  }

  public readRaw(inboxId: string, messageId: string, options?: RequestOptions): Promise<Uint8Array> {
    return this.requestBytes(`/v1/inboxes/${segment(inboxId)}/messages/${segment(messageId)}/raw`, options);
  }

  public listAttachments(inboxId: string, messageId: string, options?: RequestOptions): Promise<AttachmentDescriptor[]> {
    return this.request(`/v1/inboxes/${segment(inboxId)}/messages/${segment(messageId)}/attachments`, { ...options });
  }

  public downloadAttachment(
    inboxId: string,
    messageId: string,
    attachmentId: string,
    options?: RequestOptions,
  ): Promise<{ attachment: AttachmentDescriptor; data: Uint8Array }> {
    return Promise.all([
      this.listAttachments(inboxId, messageId, options).then((attachments) => {
        const attachment = attachments.find((item) => item.id === attachmentId);
        if (!attachment) {
          throw new MailFnClientError('MAILFN_NOT_FOUND', 'Attachment metadata was not found', 404, false);
        }
        return attachment;
      }),
      this.requestBytes(
        `/v1/inboxes/${segment(inboxId)}/messages/${segment(messageId)}/attachments/${segment(attachmentId)}`,
        options,
      ),
    ]).then(([attachment, data]) => ({ attachment, data }));
  }

  public waitForMessages(inboxId: string, input: Omit<WaitForMessageInput, 'projectId' | 'inboxId' | 'signal'>, options?: RequestOptions): Promise<WaitForMessageResult> {
    return this.request(`/v1/inboxes/${segment(inboxId)}/messages/wait`, {
      method: 'POST',
      body: input,
      ...options,
      timeoutMs: Math.max(options?.timeoutMs ?? 0, (input.timeoutMs ?? 30_000) + 5_000),
    });
  }

  public searchMessages(
    inboxId: string,
    input: { query: string; cursor?: string; limit?: number; receivedAfter?: string; receivedBefore?: string },
    options?: RequestOptions,
  ): Promise<Page<Message>> {
    return this.request(`/v1/inboxes/${segment(inboxId)}/messages/search${queryString(input)}`, { ...options });
  }

  public extractVerification(
    inboxId: string,
    messageId: string,
    type: ExtractedVerification['type'],
    options?: RequestOptions,
  ): Promise<ExtractedVerification> {
    return this.request(`/v1/inboxes/${segment(inboxId)}/messages/${segment(messageId)}/extract`, {
      method: 'POST',
      body: { type },
      ...options,
    });
  }

  public labelMessage(inboxId: string, messageId: string, labels: string[], options?: RequestOptions): Promise<Message> {
    return this.request(`/v1/inboxes/${segment(inboxId)}/messages/${segment(messageId)}/labels`, {
      method: 'PUT',
      body: { labels },
      ...options,
    });
  }

  public listThreads(inboxId: string, options?: RequestOptions): Promise<Thread[]> {
    return this.request(`/v1/inboxes/${segment(inboxId)}/threads`, { ...options });
  }

  public labelThread(inboxId: string, threadId: string, labels: string[], options?: RequestOptions): Promise<Thread> {
    return this.request(`/v1/inboxes/${segment(inboxId)}/threads/${segment(threadId)}/labels`, {
      method: 'PUT', body: { labels }, ...options,
    });
  }

  public createDraft(input: Omit<CreateDraftInput, 'projectId'>, options?: RequestOptions): Promise<Draft> {
    return this.request(`/v1/inboxes/${segment(input.inboxId)}/drafts`, { method: 'POST', body: input, ...options });
  }

  public listDrafts(inboxId: string, options?: RequestOptions): Promise<Draft[]> {
    return this.request(`/v1/inboxes/${segment(inboxId)}/drafts`, { ...options });
  }

  public getDraft(draftId: string, options?: RequestOptions): Promise<Draft> {
    return this.request(`/v1/drafts/${segment(draftId)}`, { ...options });
  }

  public updateDraft(draftId: string, input: UpdateDraftInput, options?: RequestOptions): Promise<Draft> {
    return this.request(`/v1/drafts/${segment(draftId)}`, { method: 'PATCH', body: input, ...options });
  }

  public discardDraft(draftId: string, options?: RequestOptions): Promise<Draft> {
    return this.request(`/v1/drafts/${segment(draftId)}`, { method: 'DELETE', ...options });
  }

  public createReplyDraft(
    inboxId: string,
    messageId: string,
    input: { text?: string; html?: string; replyAll?: boolean },
    options?: RequestOptions,
  ): Promise<Draft> {
    return this.request(`/v1/inboxes/${segment(inboxId)}/messages/${segment(messageId)}/reply`, {
      method: 'POST',
      body: input,
      ...options,
    });
  }

  public createForwardDraft(
    inboxId: string,
    messageId: string,
    input: { to: string[]; text?: string; html?: string; includeOriginalAttachments?: boolean },
    options?: RequestOptions,
  ): Promise<Draft> {
    return this.request(`/v1/inboxes/${segment(inboxId)}/messages/${segment(messageId)}/forward`, {
      method: 'POST',
      body: input,
      ...options,
    });
  }

  public sendDraft(draftId: string, options?: RequestOptions): Promise<Draft> {
    return this.request(`/v1/drafts/${segment(draftId)}/send`, { method: 'POST', body: {}, ...options });
  }

  public createWebhook(input: { inboxId?: string; url: string; eventTypes: MailFnEventType[] }, options?: RequestOptions): Promise<CreatedWebhook> {
    return this.request('/v1/webhooks', { method: 'POST', body: input, ...options });
  }

  public createDomain(domain: string, options?: RequestOptions): Promise<MailDomain> {
    return this.request('/v1/domains', { method: 'POST', body: { domain }, ...options });
  }

  public verifyDomain(domainId: string, options?: RequestOptions): Promise<MailDomain> {
    return this.request(`/v1/domains/${segment(domainId)}/verify`, { method: 'POST', body: {}, ...options });
  }

  public disableDomain(domainId: string, options?: RequestOptions): Promise<MailDomain> {
    return this.request(`/v1/domains/${segment(domainId)}`, { method: 'DELETE', ...options });
  }

  public getAuditEvents(after?: string, options?: RequestOptions): Promise<AuditEvent[]> {
    return this.request(`/v1/audit${queryString({ after })}`, { ...options });
  }

  public getOperationalSnapshot(options?: RequestOptions): Promise<{ snapshot: OperationalSnapshot; alerts: OperationalAlert[] }> {
    return this.request('/v1/operations/snapshot', { ...options });
  }

  public getUsage(period?: string, options?: RequestOptions): Promise<UsageRecord[]> {
    return this.request(`/v1/billing/usage${queryString({ period })}`, { ...options });
  }

  public reportAbuse(
    input: Pick<AbuseCase, 'kind' | 'resourceType' | 'resourceId' | 'reason'>,
    options?: RequestOptions,
  ): Promise<AbuseCase> {
    return this.request('/v1/abuse', { method: 'POST', body: input, ...options });
  }

  public listAbuseCases(options?: RequestOptions): Promise<AbuseCase[]> {
    return this.request('/v1/abuse', { ...options });
  }

  public updateAbuseCase(
    abuseCaseId: string,
    input: { status: AbuseCase['status']; disableResource?: boolean },
    options?: RequestOptions,
  ): Promise<AbuseCase> {
    return this.request(`/v1/abuse/${segment(abuseCaseId)}`, { method: 'PATCH', body: input, ...options });
  }

  public listSenderReputations(options?: RequestOptions): Promise<SenderReputation[]> {
    return this.request('/v1/reputation', { ...options });
  }

  public updateSenderReputation(
    sender: string,
    input: Pick<SenderReputation, 'status' | 'score'> & { reason?: string },
    options?: RequestOptions,
  ): Promise<SenderReputation> {
    return this.request(`/v1/reputation/${segment(sender)}`, { method: 'PUT', body: input, ...options });
  }

  public createSupportCase(
    input: Pick<SupportCase, 'subject' | 'severity' | 'description'>,
    options?: RequestOptions,
  ): Promise<SupportCase> {
    return this.request('/v1/support/cases', { method: 'POST', body: input, ...options });
  }

  public listSupportCases(options?: RequestOptions): Promise<SupportCase[]> {
    return this.request('/v1/support/cases', { ...options });
  }

  public updateSupportCase(
    supportCaseId: string,
    input: { status: SupportCase['status'] },
    options?: RequestOptions,
  ): Promise<SupportCase> {
    return this.request(`/v1/support/cases/${segment(supportCaseId)}`, { method: 'PATCH', body: input, ...options });
  }

  public configureCompliance(
    input: Omit<ComplianceProfile, 'projectId' | 'updatedAt'>,
    options?: RequestOptions,
  ): Promise<ComplianceProfile> {
    return this.request('/v1/compliance', { method: 'PUT', body: input, ...options });
  }

  public exportCompliance(options?: RequestOptions): Promise<ComplianceExport> {
    return this.request('/v1/compliance/export', { ...options });
  }

  public async request<T>(path: string, options: RequestOptions & { body?: unknown; idempotent?: boolean; method?: string } = {}): Promise<T> {
    const response = await this.perform(path, options);
    let envelope: Envelope<T>;
    try {
      envelope = (await response.json()) as Envelope<T>;
    } catch (error) {
      throw new MailFnClientError('MAILFN_INVALID_RESPONSE', 'MailFn returned invalid JSON', response.status, false, undefined, undefined, { cause: error });
    }
    if (!envelope || typeof envelope.ok !== 'boolean' || !envelope.meta?.requestId) {
      throw new MailFnClientError('MAILFN_INVALID_RESPONSE', 'MailFn response envelope is invalid', response.status, false);
    }
    if (!envelope.ok || !response.ok) {
      throw new MailFnClientError(
        (envelope.error?.code ?? 'MAILFN_INVALID_RESPONSE') as MailFnClientError['code'],
        envelope.error?.message ?? `MailFn request failed with HTTP ${response.status}`,
        response.status,
        envelope.error?.retryable ?? false,
        envelope.meta.requestId,
        envelope.error?.details,
      );
    }
    return envelope.data as T;
  }

  private async requestBytes(path: string, options: RequestOptions = {}): Promise<Uint8Array> {
    const response = await this.perform(path, options);
    if (!response.ok) {
      let body: Envelope<unknown> | null = null;
      try { body = (await response.json()) as Envelope<unknown>; } catch { /* binary or empty error */ }
      throw new MailFnClientError(
        (body?.error?.code ?? 'MAILFN_INVALID_RESPONSE') as MailFnClientError['code'],
        body?.error?.message ?? `MailFn binary request failed with HTTP ${response.status}`,
        response.status,
        body?.error?.retryable ?? false,
        body?.meta?.requestId,
      );
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  private async perform(path: string, options: RequestOptions & { body?: unknown; idempotent?: boolean; method?: string }): Promise<Response> {
    const method = options.method ?? 'GET';
    const canRetry = method === 'GET' || options.idempotent === true;
    let lastError: unknown;
    for (let attempt = 0; attempt <= (canRetry ? this.retries : 0); attempt += 1) {
      if (options.signal?.aborted) {
        throw new MailFnClientError('MAILFN_NETWORK_ERROR', 'MailFn request was cancelled', 0, false);
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? this.timeoutMs);
      const abort = () => controller.abort();
      options.signal?.addEventListener('abort', abort, { once: true });
      try {
        const token = typeof this.config.token === 'function' ? await this.config.token() : this.config.token;
        const response = await this.fetcher(`${this.baseUrl}${path}`, {
          method,
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
            ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
            ...(this.config.userAgent ? { 'User-Agent': this.config.userAgent } : {}),
            ...(options.headers ?? {}),
          },
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
          signal: controller.signal,
        });
        if (canRetry && attempt < this.retries && (response.status === 429 || response.status >= 500)) {
          await delay(retryDelay(response, attempt), options.signal);
          continue;
        }
        return response;
      } catch (error) {
        lastError = error;
        if (options.signal?.aborted) {
          throw new MailFnClientError('MAILFN_NETWORK_ERROR', 'MailFn request was cancelled', 0, false, undefined, undefined, { cause: error });
        }
        if (!canRetry || attempt >= this.retries) break;
        await delay(100 * 2 ** attempt, options.signal);
      } finally {
        clearTimeout(timeout);
        options.signal?.removeEventListener('abort', abort);
      }
    }
    throw new MailFnClientError('MAILFN_NETWORK_ERROR', 'MailFn network request failed', 0, true, undefined, undefined, { cause: lastError });
  }
}

function stripTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47) end -= 1;
  return value.slice(0, end);
}

export interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

function segment(value: string): string {
  return encodeURIComponent(value);
}

function queryString(input: Record<string, unknown>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      for (const item of value) query.append(key, String(item));
    } else {
      query.set(key, String(value));
    }
  }
  const encoded = query.toString();
  return encoded ? `?${encoded}` : '';
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = Number.parseInt(response.headers.get('retry-after') ?? '', 10);
  return Number.isFinite(retryAfter) ? Math.min(10_000, retryAfter * 1000) : 100 * 2 ** attempt;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
  return new Promise((resolve, reject) => {
    const cleanup = () => signal?.removeEventListener('abort', abort);
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const abort = () => {
      clearTimeout(timer);
      cleanup();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', abort, { once: true });
  });
}

export type MailFnActor = Actor;
