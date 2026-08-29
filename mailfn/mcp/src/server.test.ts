import { describe, expect, it, vi } from 'vitest';
import { PassThrough } from 'node:stream';

import type { MailFnClient } from '@mailfn/client';
import { MailFnMcpServer, serveMailFnMcpStdio } from './server.js';

const message = {
  id: 'm', inboxId: 'i', from: [{ address: 'sender@example.com' }], to: [{ address: 'agent@example.com' }],
  subject: 'Secret', receivedAt: '2026-08-10T00:00:00.000Z', status: 'ready', labels: [], sizeBytes: 42,
  textBody: 'Code is 123456', htmlBody: '<p>123456</p>',
};

describe('MailFn MCP server', () => {
  it('advertises narrow tools and redacts message content by default', async () => {
    const client = {
      readMessage: vi.fn(async () => message),
      listMessages: vi.fn(async () => ({ items: [message] })),
    } as unknown as MailFnClient;
    const server = new MailFnMcpServer(client);
    await server.handleRequest({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-11-25' } });
    await server.handleRequest({ jsonrpc: '2.0', method: 'notifications/initialized' });
    const listed = await server.handleRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect((listed?.result?.tools as Array<{ name: string }>).map((tool) => tool.name)).toContain('mailfn_extract_verification');
    const result = await server.callTool('mailfn_read_message', { inbox_id: 'i', message_id: 'm' });
    expect(JSON.stringify(result)).not.toContain('123456');
    expect(result).toMatchObject({ message: { id: 'm', receivedAt: message.receivedAt } });
    expect(JSON.stringify(result)).not.toContain('Secret');
    const revealed = await server.callTool('mailfn_read_message', {
      inbox_id: 'i', message_id: 'm', include_content: true,
    });
    expect(revealed).toMatchObject({ message: {
      subject: 'Secret', textBody: 'Code is 123456', htmlBody: '<p>123456</p>',
    } });
  });

  it('returns verification material only through the explicit extraction tool', async () => {
    const client = {
      extractVerification: vi.fn(async () => ({ type: 'otp', value: '123456', sourceMessageId: 'm', receivedAt: '', matchedField: 'text' })),
    } as unknown as MailFnClient;
    const server = new MailFnMcpServer(client);
    const result = await server.callTool('mailfn_extract_verification', { inbox_id: 'i', message_id: 'm', type: 'otp' });
    expect(result).toMatchObject({ verification: { value: '123456', sourceMessageId: 'm' } });
  });

  it('speaks newline-delimited MCP stdio and negotiates a supported protocol version', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    let written = '';
    output.setEncoding('utf8');
    output.on('data', (chunk: string) => { written += chunk; });
    const client = { listAttachments: vi.fn() } as unknown as MailFnClient;
    const serving = serveMailFnMcpStdio(client, undefined, { input, output });
    input.end(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25' } })}\n${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })}\n`);
    await serving;
    const responses = written.trim().split('\n').map((line) => JSON.parse(line));
    expect(responses).toHaveLength(2);
    expect(responses[0]).toMatchObject({ id: 1, result: { protocolVersion: '2025-11-25' } });
    expect(responses[1]?.result?.tools).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'mailfn_create_inbox' })]));
    expect(written).not.toContain('Content-Length');
  });

  it('never replies to notifications and validates JSON-RPC lifecycle and request shape', async () => {
    const client = {} as MailFnClient;
    const server = new MailFnMcpServer(client);
    await expect(server.handleRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' })).resolves.toMatchObject({
      error: { code: -32002 },
    });
    await server.handleRequest({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '2025-11-25' } });
    await expect(server.handleRequest({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 9 } })).resolves.toBeNull();
    await expect(server.handleRequest({ jsonrpc: '2.0', id: 9, method: 'notifications/cancelled' })).resolves.toMatchObject({
      error: { code: -32600 },
    });
    await expect(server.handleRequest({ jsonrpc: '2.0', method: 'unknown/notification' })).resolves.toBeNull();
    await server.handleRequest({ jsonrpc: '2.0', method: 'notifications/initialized' });
    await expect(server.handleRequest({ jsonrpc: '2.0', id: 3, method: 'tools/list' })).resolves.toMatchObject({
      result: { tools: expect.any(Array) },
    });
    await expect(server.handleRequest({ jsonrpc: '1.0', id: 4, method: 'tools/list' })).resolves.toMatchObject({
      id: null, error: { code: -32600 },
    });
    await expect(server.handleRequest([])).resolves.toMatchObject({ id: null, error: { code: -32600 } });
  });

  it('contains malformed tool calls and cancels active waits', async () => {
    const waitForMessages = vi.fn((_inboxId, _input, options?: { signal?: AbortSignal }) => new Promise((_, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new Error('cancelled')), { once: true });
    }));
    const server = new MailFnMcpServer({ waitForMessages } as unknown as MailFnClient);
    await server.handleRequest({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
    await server.handleRequest({ jsonrpc: '2.0', method: 'notifications/initialized' });
    await expect(server.handleRequest({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { arguments: {} } })).resolves.toMatchObject({
      result: { isError: true },
    });
    const waiting = server.handleRequest({
      jsonrpc: '2.0', id: 3, method: 'tools/call',
      params: { name: 'mailfn_wait_for_message', arguments: { inbox_id: 'i', timeout_ms: 30_000 } },
    });
    await vi.waitFor(() => expect(waitForMessages).toHaveBeenCalled());
    await server.handleRequest({
      jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 3 },
    });
    await expect(waiting).resolves.toMatchObject({ result: { isError: true } });
  });
});
