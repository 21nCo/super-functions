/**
 * authfn - API key authentication using Superfunctions abstractions
 */

import type { AuthProvider } from '@superfunctions/auth';
import { InvalidCredentialsError, ExpiredCredentialsError } from '@superfunctions/auth';
import { createRouter } from '@superfunctions/http';
import { UnauthorizedError, NotFoundError } from '@superfunctions/http';
import type { AuthFnConfig, AuthFnInstance, ApiKey, ApiKeySession } from './types.js';

/**
 * Generate a secure API key
 */
function generateApiKey(prefix: string = 'ak'): string {
  const randomBytes = crypto.getRandomValues(new Uint8Array(32));
  const key = Array.from(randomBytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return `${prefix}_${key}`;
}

/**
 * Generate unique ID
 */
function generateId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 9);
  return `${prefix}_${timestamp}${random}`;
}

/**
 * Create authfn instance
 */
export function createAuthFn(config: AuthFnConfig): AuthFnInstance {
  const { database, namespace = 'authfn', enableApi = false, apiConfig } = config;

  // Auth provider implementation
  const provider: AuthProvider<ApiKeySession> = {
    async authenticate(request: Request): Promise<ApiKeySession | null> {
      const authHeader = request.headers.get('authorization');
      
      if (!authHeader) {
        return null;
      }

      const token = authHeader.replace(/^Bearer\s+/i, '');
      
      if (!token) {
        return null;
      }

      // Look up API key in database
      const apiKey = await database.findOne<ApiKey>({
        model: 'apiKeys',
        where: [
          { field: 'key', operator: 'eq', value: token },
        ],
        namespace,
      });

      if (!apiKey) {
        throw new InvalidCredentialsError('Invalid API key');
      }

      // Check if revoked
      if (apiKey.revokedAt) {
        throw new InvalidCredentialsError('API key has been revoked');
      }

      // Check if expired
      if (apiKey.expiresAt) {
        const expiresAt = new Date(apiKey.expiresAt);
        if (expiresAt < new Date()) {
          throw new ExpiredCredentialsError('API key has expired');
        }
      }

      // Update last used timestamp
      await database.update({
        model: 'apiKeys',
        where: [{ field: 'id', operator: 'eq', value: apiKey.id }],
        data: { lastUsedAt: new Date().toISOString() },
        namespace,
      });

      return {
        id: apiKey.id,
        type: 'api-key',
        keyId: apiKey.id,
        name: apiKey.name,
        resourceIds: apiKey.resourceIds as string[],
        scopes: apiKey.scopes as string[] | undefined,
        expiresAt: apiKey.expiresAt ? new Date(apiKey.expiresAt) : undefined,
        metadata: apiKey.metadata as Record<string, any> | undefined,
      };
    },

    async authorize(session: ApiKeySession, resourceId: string): Promise<boolean> {
      return session.resourceIds.includes(resourceId);
    },

    async revoke(sessionId: string): Promise<void> {
      await database.update({
        model: 'apiKeys',
        where: [{ field: 'id', operator: 'eq', value: sessionId }],
        data: { revokedAt: new Date().toISOString() },
        namespace,
      });
    },
  };

  // Key management functions
  async function createKey(data: {
    name: string;
    resourceIds: string[];
    scopes?: string[];
    metadata?: Record<string, any>;
    expiresAt?: Date;
  }): Promise<{ id: string; key: string }> {
    const id = generateId('key');
    const key = generateApiKey('ak');

    await database.create({
      model: 'apiKeys',
      data: {
        id,
        key,
        name: data.name,
        resourceIds: data.resourceIds,
        scopes: data.scopes || null,
        metadata: data.metadata || null,
        expiresAt: data.expiresAt ? data.expiresAt.toISOString() : null,
        lastUsedAt: null,
        revokedAt: null,
        createdAt: new Date().toISOString(),
      },
      namespace,
    });

    return { id, key };
  }

  async function revokeKey(keyId: string): Promise<void> {
    await database.update({
      model: 'apiKeys',
      where: [{ field: 'id', operator: 'eq', value: keyId }],
      data: { revokedAt: new Date().toISOString() },
      namespace,
    });
  }

  async function getKey(keyId: string): Promise<ApiKey | null> {
    const key = await database.findOne<ApiKey>({
      model: 'apiKeys',
      where: [{ field: 'id', operator: 'eq', value: keyId }],
      namespace,
    });
    return key;
  }

  async function listKeys(filters?: { resourceId?: string }): Promise<ApiKey[]> {
    const where: any[] = [];
    
    if (filters?.resourceId) {
      where.push({ field: 'resourceIds', operator: 'contains', value: filters.resourceId });
    }

    const keys = await database.findMany<ApiKey>({
      model: 'apiKeys',
      where,
      orderBy: [{ field: 'createdAt', direction: 'desc' }],
      namespace,
    });

    return keys;
  }

  // Create management API router if enabled
  let router;
  if (enableApi) {
    const adminKey = apiConfig?.adminKey;

    // Admin auth middleware
    const adminAuthMiddleware = async (req: Request, _ctx: any, next: () => Promise<Response>) => {
      if (!adminKey) {
        return next(); // No admin key configured, skip auth
      }

      const authHeader = req.headers.get('authorization');
      const token = authHeader?.replace(/^Bearer\s+/i, '');

      if (token !== adminKey) {
        throw new UnauthorizedError('Invalid admin key');
      }

      return next();
    };

    router = createRouter({
      middleware: [adminAuthMiddleware],
      routes: [
        // POST /keys - Create API key
        {
          method: 'POST',
          path: '/keys',
          handler: async (_req, ctx) => {
            const body = await ctx.json();

            const result = await createKey({
              name: body.name,
              resourceIds: body.resourceIds,
              scopes: body.scopes,
              metadata: body.metadata,
              expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
            });

            return Response.json(result, { status: 201 });
          },
        },

        // GET /keys - List API keys
        {
          method: 'GET',
          path: '/keys',
          handler: async (_req, ctx) => {
            const resourceId = ctx.query.get('resourceId') || undefined;
            const keys = await listKeys({ resourceId });

            // Don't return the actual key values
            const sanitized = keys.map(k => ({
              id: k.id,
              name: k.name,
              resourceIds: k.resourceIds,
              scopes: k.scopes,
              metadata: k.metadata,
              expiresAt: k.expiresAt,
              lastUsedAt: k.lastUsedAt,
              revokedAt: k.revokedAt,
              createdAt: k.createdAt,
            }));

            return Response.json({ keys: sanitized });
          },
        },

        // GET /keys/:id - Get API key
        {
          method: 'GET',
          path: '/keys/:id',
          handler: async (_req, ctx) => {
            const key = await getKey(ctx.params.id);

            if (!key) {
              throw new NotFoundError('API key not found');
            }

            // Don't return the actual key value
            const { key: _, ...sanitized } = key;

            return Response.json(sanitized);
          },
        },

        // DELETE /keys/:id - Revoke API key
        {
          method: 'DELETE',
          path: '/keys/:id',
          handler: async (_req, ctx) => {
            await revokeKey(ctx.params.id);
            return Response.json({ success: true });
          },
        },
      ],
    });
  }

  return {
    provider: {
      authenticate: provider.authenticate.bind(provider),
      authorize: provider.authorize!.bind(provider),
      revoke: provider.revoke!.bind(provider),
    },
    router,
    createKey,
    revokeKey,
    getKey,
    listKeys,
  };
}

// Re-export types
export type { AuthFnConfig, AuthFnInstance, ApiKey, ApiKeySession } from './types.js';
export { getSchema } from './schema.js';
