import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { IMemoryFn } from '../src/core/config';
import { MemoryMCP } from '../src/mcp/server';

describe('MemoryMCP', () => {
  const closeables: Array<{ close(): Promise<void> }> = [];

  afterEach(async () => {
    await Promise.all(closeables.splice(0).map((value) => value.close().catch(() => undefined)));
  });

  it('uses the official MCP transport with validated structured results', async () => {
    const memory: IMemoryFn = {
      add: vi.fn(async (input) => ({
        memories: [{
          id: 'memory-1',
          tenantId: 'tenant-1',
          containerTags: input.containerTags,
          type: 'conversational',
          content: input.content ?? '',
          embedding: null,
          metadata: {},
          isLatest: true,
          createdAt: 1,
          updatedAt: 1,
        }],
        relationships: [],
        summary: { created: 1, updated: 0, deduplicated: 0 },
      })),
      search: vi.fn(async () => ({
        results: [{
          id: 'memory-1',
          tenantId: 'tenant-1',
          containerTags: [],
          type: 'conversational',
          content: 'Remember this',
          embedding: null,
          metadata: {},
          isLatest: true,
          createdAt: 1,
          updatedAt: 1,
        }],
        metadata: { totalFound: 1, returned: 1 },
      })),
    };
    const server = new MemoryMCP(memory, { tenantId: 'test', containerTags: [] });
    const client = new Client(
      { name: 'memoryfn-test', version: '1.0.0' },
      { capabilities: {} },
    );
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    closeables.push(client, server);

    await expect(client.listTools()).resolves.toMatchObject({
      tools: [
        { name: 'add_memory', outputSchema: { required: ['result'] } },
        { name: 'search_memories', outputSchema: { required: ['result'] } },
      ],
    });
    const added = await client.callTool({
      name: 'add_memory',
      arguments: { content: 'Remember this', tags: ['project'] },
    });
    expect(added.isError).not.toBe(true);
    expect(added.structuredContent).toEqual({
      result: { summary: { created: 1, updated: 0, deduplicated: 0 } },
    });
    expect(JSON.stringify(added.structuredContent)).not.toMatch(/tenantId|embedding|metadata|memory-1/);
    expect(memory.add).toHaveBeenCalledWith(expect.objectContaining({
      content: 'Remember this',
      containerTags: ['project'],
    }));

    const searched = await client.callTool({
      name: 'search_memories',
      arguments: { query: 'Remember' },
    });
    expect(searched.structuredContent).toEqual({
      result: {
        results: [{ content: 'Remember this' }],
        metadata: { totalFound: 1, returned: 1 },
      },
    });
    expect(JSON.stringify(searched.structuredContent)).not.toMatch(
      /tenantId|embedding|containerTags|memory-1/,
    );

    const invalid = await client.callTool({
      name: 'search_memories',
      arguments: { query: '', limit: 0 },
    });
    expect(invalid.isError).toBe(true);
    expect(memory.search).toHaveBeenCalledTimes(1);
  });
});
