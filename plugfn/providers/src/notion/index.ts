import { applySelectedResources } from '../shared/selected-resources.js';
import { declareContracts } from '../shared/selected-contracts.js';
import { restAction, jsonObject, remoteId, segment } from '../shared/rest-action.js';
import { z } from 'zod';
import type { ActionContext } from 'plugfn';
import type { Provider } from 'plugfn';
import { AuthType } from 'plugfn';

const notionPageParentSchema = z.union([
  z.object({ database_id: z.string() }).passthrough(),
  z.object({ page_id: z.string() }).passthrough(),
  z.object({ workspace: z.boolean() }).passthrough(),
]);

const notionPropertiesSchema = z.record(z.string(), z.unknown());
const notionChildrenSchema = z.array(z.record(z.string(), z.unknown()));

export const notionProvider: Provider = {
  name: 'notion',
  displayName: 'Notion',
  version: '1.0.0',
  description: 'Integration with Notion pages, databases, users, and search',
  iconUrl: 'https://www.notion.so/images/favicon.ico',
  baseUrl: 'https://api.notion.com/v1',
  headers: {
    'Notion-Version': '2022-06-28',
  },

  auth: {
    type: AuthType.OAuth2,
    config: {
      authorizationUrl: 'https://api.notion.com/v1/oauth/authorize',
      tokenUrl: 'https://api.notion.com/v1/oauth/token',
      scopes: [],
      scopeSeparator: ' ',
      extraAuthParams: { owner: 'user' },
      tokenBodyEncoding: 'json',
      tokenAuthMethod: 'client_secret_basic',
      tokenHeaders: { 'Notion-Version': '2025-09-03' },
      supportsPkce: false,
    },
  },

  actions: {
    'users.me': {
      name: 'users.me',
      displayName: 'Get Current User',
      description: 'Return the Notion user attached to the current token',
      idempotent: true,
      parameters: z.object({}),
      returns: z.unknown(),
      execute: async (_params: unknown, context: ActionContext) => {
        const response = await context.http.get(`${context.provider.baseUrl}/users/me`);
        return response.data;
      },
    },

    'search.query': {
      name: 'search.query',
      displayName: 'Search',
      description: 'Search pages and databases visible to the integration',
      idempotent: true,
      parameters: z.object({
        query: z.string().optional(),
        pageSize: z.number().int().positive().max(100).optional(),
        startCursor: z.string().optional(),
        filter: z.record(z.string(), z.unknown()).optional(),
        sort: z.record(z.string(), z.unknown()).optional(),
      }),
      returns: z.unknown(),
      execute: async (params: any, context: ActionContext) => {
        const response = await context.http.post(`${context.provider.baseUrl}/search`, {
          query: params.query,
          page_size: params.pageSize,
          start_cursor: params.startCursor,
          filter: params.filter,
          sort: params.sort,
        });
        return response.data;
      },
    },

    'pages.get': {
      name: 'pages.get',
      displayName: 'Get Page',
      description: 'Retrieve a Notion page by ID',
      idempotent: true,
      parameters: z.object({
        pageId: z.string().min(1),
      }),
      returns: z.unknown(),
      execute: async (params: any, context: ActionContext) => {
        const response = await context.http.get(`${context.provider.baseUrl}/pages/${params.pageId}`);
        return response.data;
      },
    },

    'pages.create': {
      name: 'pages.create',
      displayName: 'Create Page',
      description: 'Create a Notion page under a page or database parent',
      parameters: z.object({
        parent: notionPageParentSchema,
        properties: notionPropertiesSchema,
        children: notionChildrenSchema.optional(),
        icon: z.record(z.string(), z.unknown()).optional(),
        cover: z.record(z.string(), z.unknown()).optional(),
      }),
      returns: z.unknown(),
      execute: async (params: any, context: ActionContext) => {
        const response = await context.http.post(`${context.provider.baseUrl}/pages`, {
          parent: params.parent,
          properties: params.properties,
          children: params.children,
          icon: params.icon,
          cover: params.cover,
        });
        return response.data;
      },
    },

    'pages.update': {
      name: 'pages.update',
      displayName: 'Update Page',
      description: 'Update page properties, icon, cover, or archived state',
      parameters: z.object({
        pageId: z.string().min(1),
        properties: notionPropertiesSchema.optional(),
        archived: z.boolean().optional(),
        icon: z.record(z.string(), z.unknown()).optional(),
        cover: z.record(z.string(), z.unknown()).optional(),
      }),
      returns: z.unknown(),
      execute: async (params: any, context: ActionContext) => {
        const response = await context.http.patch(`${context.provider.baseUrl}/pages/${params.pageId}`, {
          properties: params.properties,
          archived: params.archived,
          icon: params.icon,
          cover: params.cover,
        });
        return response.data;
      },
    },

    'blocks.children.list': {
      name: 'blocks.children.list',
      displayName: 'List Block Children',
      description: 'List children for a Notion block or page',
      idempotent: true,
      parameters: z.object({
        blockId: z.string().min(1),
        pageSize: z.number().int().positive().max(100).optional(),
        startCursor: z.string().optional(),
      }),
      returns: z.unknown(),
      execute: async (params: any, context: ActionContext) => {
        const query = new URLSearchParams();
        if (params.pageSize) {
          query.set('page_size', String(params.pageSize));
        }
        if (params.startCursor) {
          query.set('start_cursor', params.startCursor);
        }
        const suffix = query.toString() ? `?${query.toString()}` : '';
        const response = await context.http.get(
          `${context.provider.baseUrl}/blocks/${params.blockId}/children${suffix}`
        );
        return response.data;
      },
    },

    'blocks.children.append': {
      name: 'blocks.children.append',
      displayName: 'Append Block Children',
      description: 'Append children to a Notion block or page',
      parameters: z.object({
        blockId: z.string().min(1),
        children: notionChildrenSchema,
        after: z.string().optional(),
      }),
      returns: z.unknown(),
      execute: async (params: any, context: ActionContext) => {
        const response = await context.http.patch(
          `${context.provider.baseUrl}/blocks/${params.blockId}/children`,
          {
            children: params.children,
            after: params.after,
          }
        );
        return response.data;
      },
    },

    'databases.retrieve': {
      name: 'databases.retrieve',
      displayName: 'Retrieve Database',
      description: 'Retrieve a Notion database by ID',
      idempotent: true,
      parameters: z.object({
        databaseId: z.string().min(1),
      }),
      returns: z.unknown(),
      execute: async (params: any, context: ActionContext) => {
        const response = await context.http.get(
          `${context.provider.baseUrl}/databases/${params.databaseId}`
        );
        return response.data;
      },
    },

    'databases.query': {
      name: 'databases.query',
      displayName: 'Query Database',
      description: 'Query pages in a Notion database',
      idempotent: true,
      parameters: z.object({
        databaseId: z.string().min(1),
        filter: z.record(z.string(), z.unknown()).optional(),
        sorts: z.array(z.record(z.string(), z.unknown())).optional(),
        pageSize: z.number().int().positive().max(100).optional(),
        startCursor: z.string().optional(),
      }),
      returns: z.unknown(),
      execute: async (params: any, context: ActionContext) => {
        const response = await context.http.post(
          `${context.provider.baseUrl}/databases/${params.databaseId}/query`,
          {
            filter: params.filter,
            sorts: params.sorts,
            page_size: params.pageSize,
            start_cursor: params.startCursor,
          }
        );
        return response.data;
      },
    },
  },
};

notionProvider.actions['search'] = { ...notionProvider.actions['search.query'], name: 'search' };
notionProvider.actions['dataSources.list'] = restAction({ name: 'dataSources.list', method: 'GET',
  parameters: z.object({ databaseId: remoteId }).strict(), path: p => `https://api.notion.com/v1/databases/${segment(p.databaseId)}`,
  headers: { 'Notion-Version': '2025-09-03' }, returns: z.object({ data_sources: z.array(z.object({ id: z.string(), name: z.string() }).passthrough()) }).passthrough(), scopes: [],
});
notionProvider.actions['dataSources.query'] = restAction({ name: 'dataSources.query', method: 'POST', read: true,
  parameters: z.object({ dataSourceId: remoteId, filter: jsonObject.optional(), sorts: z.array(jsonObject).optional(), start_cursor: remoteId.optional(), page_size: z.number().int().min(1).max(100).optional() }).strict(),
  path: p => `https://api.notion.com/v1/data_sources/${segment(p.dataSourceId)}/query`, body: ({ dataSourceId: _, ...body }) => body,
  headers: { 'Notion-Version': '2025-09-03' }, returns: z.object({ results: z.array(jsonObject), has_more: z.boolean(), next_cursor: z.string().nullable() }).passthrough(), scopes: [], pagination: { kind: 'cursor', cursorParameter: 'start_cursor', maxPageSize: 100 },
});

for (const name of ['pages.get', 'pages.create', 'pages.update']) {
  notionProvider.actions[name].returns = z.object({ id: z.string() }).passthrough();
}
for (const name of ['search', 'search.query', 'blocks.children.list', 'blocks.children.append']) {
  notionProvider.actions[name].returns = z.object({ results: z.array(jsonObject), has_more: z.boolean(), next_cursor: z.string().nullable() }).passthrough();
}

declareContracts(notionProvider, {
  "reads": [
    "search",
    "pages.get",
    "blocks.children.list"
  ],
  "writes": [
    "pages.create",
    "pages.update",
    "blocks.children.append"
  ],
  "readScopes": [],
  "writeScopes": [],
  "pagination": {
    "search": {
      "kind": "cursor",
      "cursorParameter": "startCursor",
      "maxPageSize": 100
    },
    "blocks.children.list": {
      "kind": "cursor",
      "cursorParameter": "startCursor",
      "maxPageSize": 100
    }
  }
});

applySelectedResources(notionProvider);
