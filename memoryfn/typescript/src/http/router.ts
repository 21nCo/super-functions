import { createRouter } from '../../../../packages/http/src/router.js';
import type { Route } from '../../../../packages/http/src/types.js';
import { z } from 'zod';
import type { IMemoryFn } from '../core/config';
import { requireScope, type MemoryScope } from '../storage/adapter';

/** The host authenticates on every request; caller JSON cannot choose its tenant. */
export function createMemoryRouter(memory: IMemoryFn, options: {
  authorize(request: Request): Promise<MemoryScope | null>;
  maxBodyBytes?: number;
}) {
  const tags = z.array(z.string().min(1)).default([]);
  const add = z.object({ content: z.string().min(1), containerTags: tags, metadata: z.record(z.unknown()).optional() }).strict();
  const search = z.object({ q: z.string().min(1), containerTags: tags, filters: z.record(z.unknown()).optional(), limit: z.number().int().min(1).max(100).optional(), threshold: z.number().min(-1).max(1).optional() }).strict();
  const routes: Route[] = [
    { method: 'POST', path: '/v1/memories', handler: async (request, ctx) => {
      const scope = await options.authorize(request);
      if (!scope) return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
      requireScope(scope.tenantId, scope.containerTags);
      const input = add.safeParse(await ctx.json());
      if (!input.success) return Response.json({ error: 'INVALID_INPUT' }, { status: 400 });
      return Response.json(await memory.add({ ...input.data, tenantId: scope.tenantId, containerTags: [...scope.containerTags, ...input.data.containerTags] }));
    } },
    { method: 'POST', path: '/v1/memories/search', handler: async (request, ctx) => {
      const scope = await options.authorize(request);
      if (!scope) return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
      requireScope(scope.tenantId, scope.containerTags);
      const input = search.safeParse(await ctx.json());
      if (!input.success) return Response.json({ error: 'INVALID_INPUT' }, { status: 400 });
      return Response.json(await memory.search({ ...input.data, tenantId: scope.tenantId, containerTags: [...scope.containerTags, ...input.data.containerTags] }));
    } },
  ];
  return createRouter({ routes, maxBodyBytes: options.maxBodyBytes ?? 1024 * 1024 });
}
