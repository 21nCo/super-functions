import { MailFnClient } from '@mailfn/client';
import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';

const SUPPORTED_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'] as const;

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
}

export const MAILFN_MCP_TOOLS: McpTool[] = [
  tool('mailfn_create_inbox', 'Create one stable or expiring inbox and return its inbox-scoped credential.', {
    kind: { type: 'string', enum: ['stable', 'expiring'] },
    local_part: { type: 'string' }, expiry_seconds: { type: 'number' }, run_id: { type: 'string' },
  }, ['kind']),
  tool('mailfn_wait_for_message', 'Wait for a narrowly matching message without reading unrelated mailbox content.', {
    inbox_id: { type: 'string' }, after: { type: 'string' }, sender: { type: 'string' }, sender_domain: { type: 'string' },
    subject: { type: 'string' }, timeout_ms: { type: 'number' }, expected_count: { type: 'number' },
  }, ['inbox_id']),
  tool('mailfn_list_messages', 'List message metadata for one inbox. Bodies are never returned.', {
    inbox_id: { type: 'string' }, after: { type: 'string' }, sender: { type: 'string' }, subject: { type: 'string' }, limit: { type: 'number' },
  }, ['inbox_id']),
  tool('mailfn_read_message', 'Read one exact message. Content remains redacted unless include_content is explicitly true.', {
    inbox_id: { type: 'string' }, message_id: { type: 'string' }, include_content: { type: 'boolean' }, include_attachments: { type: 'boolean' },
  }, ['inbox_id', 'message_id']),
  tool('mailfn_extract_verification', 'Extract an OTP or verification link from one exact source message.', {
    inbox_id: { type: 'string' }, message_id: { type: 'string' }, type: { type: 'string', enum: ['otp', 'verification_link'] },
  }, ['inbox_id', 'message_id', 'type']),
  tool('mailfn_revoke_inbox', 'Delete one inbox and revoke all of its inbox-scoped credentials.', {
    inbox_id: { type: 'string' },
  }, ['inbox_id']),
];

export class MailFnMcpServer {
  private initializeResponded = false;
  private initialized = false;
  private readonly activeRequests = new Map<string | number, AbortController>();

  public constructor(private readonly client: MailFnClient) {}

  public listTools(): McpTool[] {
    return structuredClone(MAILFN_MCP_TOOLS);
  }

  public async handleRequest(input: unknown): Promise<JsonRpcResponse | null> {
    const parsed = parseRequest(input);
    if ('error' in parsed) return parsed.error;
    const request = parsed.request;
    const notification = !Object.prototype.hasOwnProperty.call(request, 'id');
    const finish = (value: JsonRpcResponse): JsonRpcResponse | null => notification ? null : value;

    if (request.method === 'notifications/initialized') {
      if (!notification) return failure(request, -32600, 'notifications/initialized must not include an id');
      if (this.initializeResponded) this.initialized = true;
      return null;
    }
    if (request.method === 'notifications/cancelled') {
      const requestId = request.params?.requestId;
      if (typeof requestId === 'string' || (typeof requestId === 'number' && Number.isFinite(requestId))) {
        this.activeRequests.get(requestId)?.abort();
      }
      return notification ? null : failure(request, -32600, 'notifications/cancelled must not include an id');
    }
    if (request.method === 'initialize') {
      if (notification) return null;
      if (this.initializeResponded) return finish(failure(request, -32600, 'MailFn MCP is already initialized'));
      const requested = typeof request.params?.protocolVersion === 'string' ? request.params.protocolVersion : undefined;
      this.initializeResponded = true;
      return finish(response(request, {
        protocolVersion: requested && SUPPORTED_PROTOCOL_VERSIONS.includes(requested as never)
          ? requested
          : SUPPORTED_PROTOCOL_VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: { name: 'mailfn', version: '0.1.0' },
      }));
    }
    if (request.method === 'ping') return finish(response(request, {}));
    if (!this.initialized) return finish(failure(request, -32002, 'MailFn MCP initialization is not complete'));
    if (request.method === 'tools/list') return finish(response(request, { tools: this.listTools() }));
    if (request.method !== 'tools/call') return finish(failure(request, -32601, `Method ${request.method} is not supported`));
    const requestId = request.id === null ? undefined : request.id;
    const controller = requestId === undefined ? undefined : new AbortController();
    try {
      const name = string(request.params?.name, 'name');
      const args = object(request.params?.arguments);
      if (requestId !== undefined && controller) this.activeRequests.set(requestId, controller);
      const value = await this.callTool(name, args, controller?.signal);
      return finish(response(request, {
        content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
        structuredContent: value,
        isError: false,
      }));
    } catch (error) {
      const safe = { ok: false, error: { code: 'MAILFN_MCP_TOOL_FAILED', message: error instanceof Error ? error.message : 'Tool failed' } };
      return finish(response(request, {
        content: [{ type: 'text', text: JSON.stringify(safe) }], structuredContent: safe, isError: true,
      }));
    } finally {
      if (requestId !== undefined) this.activeRequests.delete(requestId);
    }
  }

  public async callTool(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<Record<string, unknown>> {
    switch (name) {
      case 'mailfn_create_inbox': {
        const kind = enumValue(args.kind, ['stable', 'expiring'] as const, 'kind');
        const created = await this.client.createInbox({
          kind,
          requestedLocalPart: optionalString(args.local_part),
          expirySeconds: optionalNumber(args.expiry_seconds),
          metadata: optionalString(args.run_id) ? { runId: String(args.run_id) } : undefined,
          idempotencyKey: optionalString(args.run_id) ? `mcp:${String(args.run_id)}` : undefined,
        });
        return {
          ok: true,
          inbox: { id: created.inbox.id, address: created.inbox.address, kind: created.inbox.kind, expiresAt: created.inbox.expiresAt },
          scopedCredential: { id: created.credential.credential.id, token: created.credential.token, scopes: created.credential.credential.permissions },
        };
      }
      case 'mailfn_wait_for_message': {
        const result = await this.client.waitForMessages(string(args.inbox_id, 'inbox_id'), {
          after: optionalString(args.after), sender: optionalString(args.sender), senderDomain: optionalString(args.sender_domain),
          subject: optionalString(args.subject), timeoutMs: optionalNumber(args.timeout_ms), expectedCount: optionalNumber(args.expected_count),
        }, { signal });
        return { ok: true, ...result, messages: result.messages.map(metadata) };
      }
      case 'mailfn_list_messages': {
        const result = await this.client.listMessages(string(args.inbox_id, 'inbox_id'), {
          receivedAfter: optionalString(args.after), sender: optionalString(args.sender), subject: optionalString(args.subject), limit: optionalNumber(args.limit),
        });
        return { ok: true, messages: result.items.map(metadata), nextCursor: result.nextCursor };
      }
      case 'mailfn_read_message': {
        const inboxId = string(args.inbox_id, 'inbox_id');
        const messageId = string(args.message_id, 'message_id');
        const message = await this.client.readMessage(inboxId, messageId);
        const attachments = args.include_attachments === true
          ? await this.client.listAttachments(inboxId, messageId)
          : undefined;
        return {
          ok: true,
          message: args.include_content === true ? message : metadata(message),
          ...(attachments ? { attachments } : {}),
        };
      }
      case 'mailfn_extract_verification': {
        const result = await this.client.extractVerification(
          string(args.inbox_id, 'inbox_id'), string(args.message_id, 'message_id'),
          enumValue(args.type, ['otp', 'verification_link'] as const, 'type'),
        );
        return { ok: true, verification: result };
      }
      case 'mailfn_revoke_inbox': {
        const inbox = await this.client.deleteInbox(string(args.inbox_id, 'inbox_id'));
        return { ok: true, inbox: { id: inbox.id, status: inbox.status } };
      }
      default: throw new Error(`Unknown MailFn tool ${name}`);
    }
  }
}

export async function serveMailFnMcpStdio(
  client: MailFnClient,
  signal?: AbortSignal,
  streams: { input: Readable; output: Writable } = { input: process.stdin, output: process.stdout },
): Promise<void> {
  const server = new MailFnMcpServer(client);
  const lines = createInterface({ input: streams.input, crlfDelay: Infinity });
  const close = () => lines.close();
  const pending = new Set<Promise<void>>();
  let writes = Promise.resolve();
  const emit = (value: JsonRpcResponse): Promise<void> => {
    writes = writes.then(() => write(value, streams.output));
    return writes;
  };
  const dispatch = (request: unknown): Promise<void> => server.handleRequest(request).then(async (result) => {
    if (result) await emit(result);
  });
  signal?.addEventListener('abort', close, { once: true });
  try {
    for await (const line of lines) {
      if (!line.trim()) continue;
      let request: unknown;
      try {
        request = JSON.parse(line) as unknown;
      } catch {
        await emit(failure({ jsonrpc: '2.0', id: null, method: '' }, -32700, 'Parse error'));
        continue;
      }
      const method = request && typeof request === 'object' && !Array.isArray(request)
        ? (request as Record<string, unknown>).method
        : undefined;
      if (method === 'tools/call' || method === 'notifications/cancelled') {
        const task = dispatch(request).finally(() => pending.delete(task));
        pending.add(task);
      } else {
        await dispatch(request);
      }
    }
    await Promise.all(pending);
    await writes;
  } finally {
    signal?.removeEventListener('abort', close);
  }
}

function write(value: JsonRpcResponse, output: Writable): Promise<void> {
  return new Promise((resolve, reject) => output.write(`${JSON.stringify(value)}\n`, (error) => error ? reject(error) : resolve()));
}

function tool(name: string, description: string, properties: Record<string, unknown>, required: string[] = []): McpTool {
  return { name, description, inputSchema: { type: 'object', additionalProperties: false, properties, required } };
}
function response(request: JsonRpcRequest, result: Record<string, unknown>): JsonRpcResponse {
  return { jsonrpc: '2.0', id: request.id ?? null, result };
}
function failure(request: JsonRpcRequest, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: '2.0', id: request.id ?? null, error: { code, message } };
}
function parseRequest(input: unknown): { request: JsonRpcRequest } | { error: JsonRpcResponse } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { error: failure({ jsonrpc: '2.0', id: null, method: '' }, -32600, 'Invalid Request') };
  }
  const value = input as Record<string, unknown>;
  const idValid = value.id === undefined || value.id === null || typeof value.id === 'string' ||
    (typeof value.id === 'number' && Number.isFinite(value.id));
  const paramsValid = value.params === undefined || (value.params !== null && typeof value.params === 'object' && !Array.isArray(value.params));
  if (value.jsonrpc !== '2.0' || typeof value.method !== 'string' || !value.method || !idValid || !paramsValid) {
    return { error: failure({ jsonrpc: '2.0', id: null, method: '' }, -32600, 'Invalid Request') };
  }
  return { request: value as unknown as JsonRpcRequest };
}
function object(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function string(value: unknown, name: string): string { if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required`); return value; }
function optionalString(value: unknown): string | undefined { return typeof value === 'string' && value.trim() ? value : undefined; }
function optionalNumber(value: unknown): number | undefined { return typeof value === 'number' && Number.isFinite(value) ? value : undefined; }
function enumValue<T extends string>(value: unknown, allowed: readonly T[], name: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) throw new Error(`${name} is invalid`);
  return value as T;
}
function metadata(message: Awaited<ReturnType<MailFnClient['readMessage']>>) {
  return {
    id: message.id, inboxId: message.inboxId, receivedAt: message.receivedAt, status: message.status,
    threadId: message.threadId, labels: message.labels, sizeBytes: message.sizeBytes,
  };
}
