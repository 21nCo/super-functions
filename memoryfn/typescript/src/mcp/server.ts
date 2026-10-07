import { requireScope, type MemoryScope } from '../storage/adapter';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import {
  McpFnRegistry,
  createMcpFnServer,
  structuredResult,
  type McpFnManifest,
  type McpFnObjectSchema,
  type McpFnServer,
} from '@mcpfn/core';

import type { IMemoryFn } from '../core/config';

const ADD_MEMORY_OUTPUT_SCHEMA: McpFnObjectSchema = {
  type: 'object',
  properties: {
    result: {
      type: 'object',
      properties: {
        summary: {
          type: 'object',
          properties: {
            created: { type: 'integer', minimum: 0 },
            updated: { type: 'integer', minimum: 0 },
            deduplicated: { type: 'integer', minimum: 0 },
          },
          required: ['created', 'updated', 'deduplicated'],
          additionalProperties: false,
        },
      },
      required: ['summary'],
      additionalProperties: false,
    },
  },
  required: ['result'],
  additionalProperties: false,
};

const SEARCH_MEMORIES_OUTPUT_SCHEMA: McpFnObjectSchema = {
  type: 'object',
  properties: {
    result: {
      type: 'object',
      properties: {
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: { content: { type: 'string' } },
            required: ['content'],
            additionalProperties: false,
          },
        },
        metadata: {
          type: 'object',
          properties: {
            totalFound: { type: 'integer', minimum: 0 },
            afterRerank: { type: 'integer', minimum: 0 },
            returned: { type: 'integer', minimum: 0 },
          },
          required: ['totalFound', 'returned'],
          additionalProperties: false,
        },
      },
      required: ['results', 'metadata'],
      additionalProperties: false,
    },
  },
  required: ['result'],
  additionalProperties: false,
};

export class MemoryMCP {
  readonly registry: McpFnRegistry;
  readonly server: McpFnServer;

  constructor(private readonly memory: IMemoryFn, private readonly scope: MemoryScope) {
    requireScope(scope.tenantId, scope.containerTags);
    this.registry = new McpFnRegistry()
      .register({
        name: 'add_memory',
        description: 'Add a new memory to long-term storage.',
        inputSchema: {
          type: 'object',
          properties: {
            content: {
              type: 'string',
              minLength: 1,
              description: 'The fact or information to store',
            },
            tags: {
              type: 'array',
              items: { type: 'string', minLength: 1 },
              uniqueItems: true,
              description: 'Tags used to scope and organize the memory',
            },
          },
          required: ['content'],
          additionalProperties: false,
        },
        outputSchema: ADD_MEMORY_OUTPUT_SCHEMA,
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
        metadata: { 'mcpfn/source': 'memoryfn' },
        handler: async (args) => {
          const result = await this.memory.add({
            content: args.content as string,
            tenantId: this.scope.tenantId,
            containerTags: [...this.scope.containerTags, ...((args.tags as string[] | undefined) ?? [])],
            type: 'conversational',
          });
          return structuredResult(
            {
              result: {
                summary: {
                  created: result.summary.created,
                  updated: result.summary.updated,
                  deduplicated: result.summary.deduplicated,
                },
              },
            },
            [{ type: 'text', text: 'Memory added successfully.' }],
          );
        },
      })
      .register({
        name: 'search_memories',
        description: 'Search for memories relevant to a query.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              minLength: 1,
              description: 'The search query',
            },
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 100,
              default: 5,
              description: 'Maximum number of results to return',
            },
            tags: {
              type: 'array',
              items: { type: 'string', minLength: 1 },
              uniqueItems: true,
              description: 'Optional memory scope tags',
            },
          },
          required: ['query'],
          additionalProperties: false,
        },
        outputSchema: SEARCH_MEMORIES_OUTPUT_SCHEMA,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        metadata: { 'mcpfn/source': 'memoryfn' },
        handler: async (args) => {
          const result = await this.memory.search({
            q: args.query as string,
            limit: (args.limit as number | undefined) ?? 5,
            tenantId: this.scope.tenantId,
            containerTags: [...this.scope.containerTags, ...((args.tags as string[] | undefined) ?? [])],
          });
          const publicResult = {
            results: result.results.map((entry) => ({ content: entry.content })),
            metadata: {
              totalFound: result.metadata.totalFound,
              ...(result.metadata.afterRerank === undefined
                ? {}
                : { afterRerank: result.metadata.afterRerank }),
              returned: result.metadata.returned,
            },
          };
          const text = publicResult.results.map((entry) => `- ${entry.content}`).join('\n');
          return structuredResult(
            { result: publicResult },
            [{ type: 'text', text: text || 'No relevant memories found.' }],
          );
        },
      });

    this.server = createMcpFnServer({
      info: {
        name: 'memoryfn-mcp',
        version: '0.1.0',
        instructions: 'Store and retrieve long-term memories through MemoryFn.',
      },
      registry: this.registry,
      transports: ['stdio'],
    });
  }

  manifest(): McpFnManifest {
    return this.server.manifest();
  }

  async connect(transport: Transport): Promise<void> {
    await this.server.connect(transport);
  }

  async start(): Promise<void> {
    await this.server.serveStdio();
    console.error('MemoryFn MCP Server running on stdio');
  }

  async close(): Promise<void> {
    await this.server.close();
  }
}
