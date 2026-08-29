import {
  MAILFN_API_VERSION,
  MailFn,
  MailFnError,
  type Actor,
  type CreateInboxInput,
  type CreateProjectInput,
  type MailFnScope,
  type MessageFilter,
  type UpdateInboxInput,
  type WaitForMessageInput,
} from '@mailfn/core';
import {
  createRouter,
  RouterError,
  type HttpMethod,
  type Route,
  type RouteContext,
  type Router,
} from '@superfunctions/http';

export interface MailFnHttpHandlerConfig {
  mailfn: MailFn;
  adminToken?: string;
  adminProjectId?: string;
  corsOrigins?: string[];
}

interface MailFnHttpContext {
  requestId: string;
}

export function createMailFnHttpHandler(config: MailFnHttpHandlerConfig): (request: Request) => Promise<Response> {
  const router = createMailFnRouter(config);
  return async (request) => {
    const response = request.method === 'OPTIONS'
      ? new Response(null, { status: 204 })
      : await router.handle(request);
    return cors(response, request, config.corsOrigins);
  };
}

export function createMailFnRouter(config: MailFnHttpHandlerConfig): Router<MailFnHttpContext> {
  return createRouter<MailFnHttpContext>({
    routes: createMailFnRoutes(config),
    context: (request) => ({ requestId: requestId(request) }),
    onError: (error, request) => errorResponse(
      error instanceof RouterError
        ? new MailFnError({ code: 'MAILFN_NOT_FOUND', message: 'Route not found', status: error.statusCode })
        : error,
      requestId(request),
    ),
  });
}

function createMailFnRoutes(config: MailFnHttpHandlerConfig): Route<MailFnHttpContext>[] {
  type Context = MailFnHttpContext & RouteContext;
  const route = (
    method: HttpMethod,
    path: string,
    handler: (request: Request, context: Context, actor: Actor) => Promise<Response>,
  ): Route<MailFnHttpContext> => ({
    method,
    path,
    meta: { auth: { mode: 'bearer' } },
    handler: async (request, context) => handler(request, context, await authenticate(request, config)),
  });
  const success = (context: Context, data: unknown, status = 200) => json(data, context.requestId, status);
  return [
    { method: 'GET', path: '/health', meta: { auth: { mode: 'none' } }, handler: (_request, context) => success(context, { status: 'ok', version: MAILFN_API_VERSION }) },
    { method: 'POST', path: '/v1/admin/projects', meta: { auth: { mode: 'bearer' } }, handler: async (request, context) => {
      requireAdmin(request, config.adminToken);
      return success(context, await config.mailfn.bootstrapProject(await readBody<CreateProjectInput>(request, context)), 201);
    } },
    route('POST', '/v1/inboxes', async (request, context, actor) => {
      const input = await readBody<Omit<CreateInboxInput, 'projectId'>>(request, context);
      return success(context, await config.mailfn.createInbox(actor, { ...input, projectId: actor.projectId }), 201);
    }),
    route('GET', '/v1/inboxes', async (_request, context, actor) => success(context, await config.mailfn.listInboxes(actor))),
    route('GET', '/v1/inboxes/:inboxId', async (_request, context, actor) => success(context, await config.mailfn.getInbox(actor, context.params.inboxId))),
    route('PATCH', '/v1/inboxes/:inboxId', async (request, context, actor) => success(context, await config.mailfn.updateInbox(actor, context.params.inboxId, await readBody<UpdateInboxInput>(request, context)))),
    route('DELETE', '/v1/inboxes/:inboxId', async (_request, context, actor) => success(context, await config.mailfn.deleteInbox(actor, context.params.inboxId))),
    route('POST', '/v1/inboxes/:inboxId/tokens', async (request, context, actor) => {
      const input = await readBody<{ permissions: MailFnScope[]; expiresAt?: string }>(request, context);
      return success(context, await config.mailfn.createCredential(actor, { projectId: actor.projectId, inboxId: context.params.inboxId, ...input }), 201);
    }),
    route('DELETE', '/v1/inboxes/:inboxId/tokens/:tokenId', async (_request, context, actor) => {
      await config.mailfn.getInbox(actor, context.params.inboxId);
      return success(context, await config.mailfn.revokeCredential(actor, context.params.tokenId));
    }),
    route('GET', '/v1/inboxes/:inboxId/messages', async (_request, context, actor) => success(context, await config.mailfn.listMessages(actor, {
      inboxId: context.params.inboxId, ...messageFilter(context.query), cursor: context.query.get('cursor') ?? undefined,
      limit: numberParam(context.query, 'limit'),
    }))),
    route('POST', '/v1/inboxes/:inboxId/messages/wait', async (request, context, actor) => success(context, await config.mailfn.waitForMessages(actor, {
      ...await readBody<Omit<WaitForMessageInput, 'projectId' | 'inboxId' | 'signal'>>(request, context),
      inboxId: context.params.inboxId, signal: request.signal,
    }))),
    route('GET', '/v1/inboxes/:inboxId/messages/search', async (_request, context, actor) => success(context, await config.mailfn.searchMessages(actor, {
      inboxId: context.params.inboxId, query: context.query.get('query') ?? '', cursor: context.query.get('cursor') ?? undefined,
      limit: numberParam(context.query, 'limit'), receivedAfter: context.query.get('receivedAfter') ?? undefined,
      receivedBefore: context.query.get('receivedBefore') ?? undefined,
    }))),
    route('GET', '/v1/inboxes/:inboxId/messages/:messageId', async (_request, context, actor) => success(context, await config.mailfn.getMessage(actor, context.params.inboxId, context.params.messageId))),
    route('GET', '/v1/inboxes/:inboxId/messages/:messageId/raw', async (_request, context, actor) => binary(await config.mailfn.getRawMessage(actor, context.params.inboxId, context.params.messageId), 'message/rfc822', context.requestId)),
    route('GET', '/v1/inboxes/:inboxId/messages/:messageId/attachments', async (_request, context, actor) => success(context, await config.mailfn.listAttachments(actor, context.params.inboxId, context.params.messageId))),
    route('GET', '/v1/inboxes/:inboxId/messages/:messageId/attachments/:attachmentId', async (_request, context, actor) => {
      const result = await config.mailfn.getAttachment(actor, context.params.inboxId, context.params.messageId, context.params.attachmentId);
      return binary(result.data, result.attachment.contentType, context.requestId, result.attachment.filename);
    }),
    route('POST', '/v1/inboxes/:inboxId/messages/:messageId/extract', async (request, context, actor) => {
      const input = await readBody<{ type: 'otp' | 'verification_link' }>(request, context);
      return success(context, await config.mailfn.extractVerification(actor, context.params.inboxId, context.params.messageId, input.type));
    }),
    route('PUT', '/v1/inboxes/:inboxId/messages/:messageId/labels', async (request, context, actor) => success(context, await config.mailfn.labelMessage(actor, context.params.inboxId, context.params.messageId, (await readBody<{ labels: string[] }>(request, context)).labels))),
    route('POST', '/v1/inboxes/:inboxId/messages/:messageId/reply', async (request, context, actor) => success(context, await config.mailfn.createReplyDraft(actor, context.params.inboxId, context.params.messageId, await readBody(request, context)), 201)),
    route('POST', '/v1/inboxes/:inboxId/messages/:messageId/forward', async (request, context, actor) => success(context, await config.mailfn.createForwardDraft(actor, context.params.inboxId, context.params.messageId, await readBody(request, context)), 201)),
    route('GET', '/v1/inboxes/:inboxId/threads', async (_request, context, actor) => success(context, await config.mailfn.listThreads(actor, context.params.inboxId))),
    route('PUT', '/v1/inboxes/:inboxId/threads/:threadId/labels', async (request, context, actor) => success(context, await config.mailfn.labelThread(actor, context.params.inboxId, context.params.threadId, (await readBody<{ labels: string[] }>(request, context)).labels))),
    route('POST', '/v1/inboxes/:inboxId/drafts', async (request, context, actor) => success(context, await config.mailfn.createDraft(actor, { ...await readBody<Record<string, unknown>>(request, context), inboxId: context.params.inboxId } as never), 201)),
    route('GET', '/v1/inboxes/:inboxId/drafts', async (_request, context, actor) => success(context, await config.mailfn.listDrafts(actor, context.params.inboxId))),
    route('POST', '/v1/drafts/:draftId/send', async (_request, context, actor) => success(context, await config.mailfn.sendDraft(actor, context.params.draftId))),
    route('GET', '/v1/drafts/:draftId', async (_request, context, actor) => success(context, await config.mailfn.getDraft(actor, context.params.draftId))),
    route('PATCH', '/v1/drafts/:draftId', async (request, context, actor) => success(context, await config.mailfn.updateDraft(actor, context.params.draftId, await readBody(request, context)))),
    route('DELETE', '/v1/drafts/:draftId', async (_request, context, actor) => success(context, await config.mailfn.discardDraft(actor, context.params.draftId))),
    route('POST', '/v1/webhooks', async (request, context, actor) => success(context, await config.mailfn.createWebhook(actor, await readBody(request, context)), 201)),
    route('POST', '/v1/domains', async (request, context, actor) => success(context, await config.mailfn.createDomain(actor, (await readBody<{ domain: string }>(request, context)).domain), 201)),
    route('POST', '/v1/domains/:domainId/verify', async (_request, context, actor) => success(context, await config.mailfn.verifyDomain(actor, context.params.domainId))),
    route('DELETE', '/v1/domains/:domainId', async (_request, context, actor) => success(context, await config.mailfn.disableDomain(actor, context.params.domainId))),
    route('GET', '/v1/audit', async (_request, context, actor) => success(context, await config.mailfn.getAuditEvents(actor, context.query.get('after') ?? undefined))),
    route('GET', '/v1/operations/snapshot', async (_request, context, actor) => {
      const snapshot = await config.mailfn.getOperationalSnapshot(actor);
      return success(context, { snapshot, alerts: config.mailfn.evaluateOperationalAlerts(snapshot) });
    }),
    route('GET', '/v1/billing/usage', async (_request, context, actor) => success(context, await config.mailfn.getUsage(actor, context.query.get('period') ?? undefined))),
    route('POST', '/v1/abuse', async (request, context, actor) => success(context, await config.mailfn.reportAbuse(actor, await readBody(request, context)), 201)),
    route('GET', '/v1/abuse', async (_request, context, actor) => success(context, await config.mailfn.listAbuseCases(actor))),
    route('PATCH', '/v1/abuse/:caseId', async (request, context, actor) => success(context, await config.mailfn.updateAbuseCase(actor, context.params.caseId, await readBody(request, context)))),
    route('GET', '/v1/reputation', async (_request, context, actor) => success(context, await config.mailfn.listSenderReputations(actor))),
    route('PUT', '/v1/reputation/:sender', async (request, context, actor) => success(context, await config.mailfn.updateSenderReputation(actor, context.params.sender, await readBody(request, context)))),
    route('POST', '/v1/support/cases', async (request, context, actor) => success(context, await config.mailfn.createSupportCase(actor, await readBody(request, context)), 201)),
    route('GET', '/v1/support/cases', async (_request, context, actor) => success(context, await config.mailfn.listSupportCases(actor))),
    route('PATCH', '/v1/support/cases/:caseId', async (request, context, actor) => success(context, await config.mailfn.updateSupportCase(actor, context.params.caseId, await readBody(request, context)))),
    route('PUT', '/v1/compliance', async (request, context, actor) => success(context, await config.mailfn.configureCompliance(actor, await readBody(request, context)))),
    route('GET', '/v1/compliance/export', async (_request, context, actor) => success(context, await config.mailfn.exportCompliance(actor))),
    route('POST', '/v1/admin/retention', async (request, context, actor) => {
      requireAdmin(request, config.adminToken);
      return success(context, await config.mailfn.runRetention(actor.projectId));
    }),
    route('POST', '/v1/admin/reconcile', async (request, context, actor) => {
      requireAdmin(request, config.adminToken);
      return success(context, { queued: await config.mailfn.retryPendingMessages(actor.projectId), webhooks: await config.mailfn.retryWebhookDeliveries(actor.projectId) });
    }),
  ];
}

async function authenticate(request: Request, config: MailFnHttpHandlerConfig): Promise<Actor> {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new MailFnError({ code: 'MAILFN_UNAUTHORIZED', message: 'Bearer credential is required', status: 401 });
  if (config.adminToken && config.adminProjectId && constantEquals(token, config.adminToken)) {
    return {
      actorType: 'admin', actorId: 'cloudflare-admin', projectId: config.adminProjectId,
      scopes: ['project:admin'],
    };
  }
  return config.mailfn.authenticate(token);
}

function requireAdmin(request: Request, adminToken?: string): void {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!adminToken || !token || !constantEquals(token, adminToken)) {
    throw new MailFnError({ code: 'MAILFN_UNAUTHORIZED', message: 'Administrative credential is required', status: 401 });
  }
}

async function readBody<T>(request: Request, context: RouteContext): Promise<T> {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    throw new MailFnError({ code: 'MAILFN_VALIDATION_FAILED', message: 'Content-Type must be application/json', status: 415 });
  }
  try {
    return await context.json<T>();
  } catch (error) {
    throw new MailFnError({ code: 'MAILFN_VALIDATION_FAILED', message: 'Request body is invalid JSON', status: 400, cause: error });
  }
}

function requestId(request: Request): string {
  return request.headers.get('x-request-id') ?? `req_${crypto.randomUUID().replaceAll('-', '')}`;
}

function json(data: unknown, requestId: string, status = 200): Response {
  return Response.json({ ok: true, data, error: null, meta: { requestId, version: MAILFN_API_VERSION } }, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Request-Id': requestId },
  });
}

function errorResponse(error: unknown, requestId: string): Response {
  const mailError = error instanceof MailFnError
    ? error
    : new MailFnError({ code: 'MAILFN_STORAGE_FAILED', message: 'MailFn request failed', status: 500, retryable: true, cause: error });
  return Response.json({
    ok: false,
    data: null,
    error: { code: mailError.code, message: mailError.message, retryable: mailError.retryable, details: mailError.details },
    meta: { requestId, version: MAILFN_API_VERSION },
  }, {
    status: mailError.status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Request-Id': requestId,
      ...(mailError.status === 429 ? { 'Retry-After': '1' } : {}),
      ...(mailError.status === 401 ? { 'WWW-Authenticate': 'Bearer realm="mailfn"' } : {}),
    },
  });
}

function binary(data: Uint8Array, contentType: string, requestId: string, filename?: string): Response {
  const bytes = Uint8Array.from(data);
  return new Response(bytes.buffer, {
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(bytes.byteLength),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Request-Id': requestId,
      ...(filename ? { 'Content-Disposition': `attachment; filename="${filename.replace(/["\\]/g, '_')}"` } : {}),
    },
  });
}

function cors(response: Response, request: Request, allowed: string[] = []): Response {
  const origin = request.headers.get('origin');
  if (!origin || !allowed.includes(origin)) return response;
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Request-Id');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  headers.set('Vary', 'Origin');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function messageFilter(query: URLSearchParams): MessageFilter {
  return {
    sender: query.get('sender') ?? undefined,
    senderDomain: query.get('senderDomain') ?? undefined,
    recipient: query.get('recipient') ?? undefined,
    subject: query.get('subject') ?? undefined,
    text: query.get('text') ?? undefined,
    receivedAfter: query.get('receivedAfter') ?? undefined,
    receivedBefore: query.get('receivedBefore') ?? undefined,
    unreadOnly: query.get('unreadOnly') === 'true' || undefined,
    threadId: query.get('threadId') ?? undefined,
    labels: query.getAll('labels').length ? query.getAll('labels') : undefined,
    status: (query.get('status') as MessageFilter['status']) ?? undefined,
  };
}

function numberParam(query: URLSearchParams, name: string): number | undefined {
  const value = query.get(name);
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new MailFnError({ code: 'MAILFN_VALIDATION_FAILED', message: `${name} must be an integer`, status: 400 });
  return parsed;
}

function constantEquals(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}
