import type { FileService } from './service.js';
import type { FileFnPrincipal, AuthConfig } from '../auth.js';
import type { RateLimiter } from '@superfunctions/middleware';
import { resolvePrincipal } from '../auth.js';
import { FileFnError, authRequired, invalidRenderIntent, rateLimited } from '../errors.js';

export interface FileRouteContext {
  service: FileService;
  auth: AuthConfig;
  rateLimiter?: RateLimiter;
  rateLimits?: {
    download?: {
      windowSeconds: number;
      maxRequests: number;
    };
  };
  legacyGlobalRateLimit?: boolean;
}

function getRequestId(request: Request): string | undefined {
  return request.headers.get('x-request-id') || undefined;
}

function successResponse(data: unknown, requestId?: string): Response {
  return Response.json({ ok: true, data, warnings: [], requestId }, { status: 200 });
}

function errorResponse(error: FileFnError, requestId?: string): Response {
  return Response.json({ ok: false, error: error.toJSON(), requestId }, { status: error.statusCode });
}

export function createFileRoutes(ctx: FileRouteContext) {
  const { service, auth, rateLimiter, rateLimits, legacyGlobalRateLimit = false } = ctx;
  const validRenderIntents = new Set(['thumbnail', 'preview', 'full', 'download']);

  async function requireAuth(request: Request): Promise<FileFnPrincipal> {
    const principal = await resolvePrincipal(request, auth);
    if (!principal && auth.required !== false) {
      throw authRequired();
    }
    return principal || { principalId: 'anonymous' };
  }

  async function checkRateLimit(
    categoryKey: string,
    principal: FileFnPrincipal,
    categoryLimit?: { windowSeconds: number; maxRequests: number }
  ): Promise<void> {
    if (!rateLimiter) {
      return;
    }
    if (!categoryLimit && !legacyGlobalRateLimit) {
      return;
    }

    const result = await rateLimiter.check({
      key: `${categoryKey}:${principal.tenantId || 'global'}:${principal.principalId}`,
      windowSeconds: categoryLimit?.windowSeconds,
      limit: categoryLimit?.maxRequests,
    });
    if (!result.allowed) {
      throw rateLimited(result.resetAt);
    }
  }

  return {
    async listFiles(request: Request): Promise<Response> {
      const requestId = getRequestId(request);
      try {
        const principal = await requireAuth(request);
        const url = new URL(request.url);
        const cursor = url.searchParams.get('cursor') || undefined;
        const rawLimit = url.searchParams.get('limit');
        const parsedLimit = rawLimit ? parseInt(rawLimit, 10) : undefined;
        const limit = typeof parsedLimit === 'number' && !Number.isNaN(parsedLimit) ? parsedLimit : undefined;

        const result = await service.listFiles(
          { principalId: principal.principalId, tenantId: principal.tenantId, requestId },
          { cursor, limit }
        );

        return successResponse(result, requestId);
      } catch (err) {
        if (err instanceof FileFnError) return errorResponse(err, requestId);
        throw err;
      }
    },

    async getFile(request: Request, fileId: string): Promise<Response> {
      const requestId = getRequestId(request);
      try {
        const principal = await requireAuth(request);
        const file = await service.getFile(fileId, {
          principalId: principal.principalId,
          tenantId: principal.tenantId,
          requestId,
        });

        return successResponse({
          fileId: file.fileId,
          currentVersionId: file.currentVersionId,
          ownerId: file.ownerId,
          tenantId: file.tenantId,
          visibility: file.visibility,
          mimeType: file.mimeType,
          size: file.size,
          name: file.name,
          createdAt: file.createdAt,
          updatedAt: file.updatedAt,
        }, requestId);
      } catch (err) {
        if (err instanceof FileFnError) return errorResponse(err, requestId);
        throw err;
      }
    },

    async downloadFile(request: Request, fileId: string, versionId?: string): Promise<Response> {
      const requestId = getRequestId(request);
      try {
        const principal = await requireAuth(request);
        await checkRateLimit('download', principal, rateLimits?.download);

        const result = await service.getDownloadUrl(fileId, versionId, {
          principalId: principal.principalId,
          tenantId: principal.tenantId,
          requestId,
        });

        return successResponse({ url: result.url, headers: result.headers }, requestId);
      } catch (err) {
        if (err instanceof FileFnError) return errorResponse(err, requestId);
        throw err;
      }
    },

    async renderFile(request: Request, fileId: string): Promise<Response> {
      const requestId = getRequestId(request);
      try {
        const principal = await requireAuth(request);
        const url = new URL(request.url);
        const intent = url.searchParams.get('intent') || undefined;
        const versionId = url.searchParams.get('versionId') || undefined;

        if (!intent || !validRenderIntents.has(intent)) {
          throw invalidRenderIntent(intent);
        }

        const descriptor = await service.getRenderDescriptor(fileId, {
          intent: intent as 'thumbnail' | 'preview' | 'full' | 'download',
          versionId,
        }, {
          principalId: principal.principalId,
          tenantId: principal.tenantId,
          requestId,
        });

        return successResponse(descriptor, requestId);
      } catch (err) {
        if (err instanceof FileFnError) return errorResponse(err, requestId);
        throw err;
      }
    },

    async deleteFile(request: Request, fileId: string): Promise<Response> {
      const requestId = getRequestId(request);
      try {
        const principal = await requireAuth(request);
        await service.deleteFile(fileId, {
          principalId: principal.principalId,
          tenantId: principal.tenantId,
          requestId,
        });

        return successResponse({ deleted: true }, requestId);
      } catch (err) {
        if (err instanceof FileFnError) return errorResponse(err, requestId);
        throw err;
      }
    },

    async listVersions(request: Request, fileId: string): Promise<Response> {
      const requestId = getRequestId(request);
      try {
        const principal = await requireAuth(request);
        const result = await service.listVersions(fileId, {
          principalId: principal.principalId,
          tenantId: principal.tenantId,
          requestId,
        });

        return successResponse({
          versions: result.versions.map(v => ({
            versionId: v.versionId,
            size: v.size,
            mimeType: v.mimeType,
            createdAt: v.createdAt,
          })),
        }, requestId);
      } catch (err) {
        if (err instanceof FileFnError) return errorResponse(err, requestId);
        throw err;
      }
    },

    async getVersion(request: Request, fileId: string, versionId: string): Promise<Response> {
      const requestId = getRequestId(request);
      try {
        const principal = await requireAuth(request);
        const version = await service.getVersion(fileId, versionId, {
          principalId: principal.principalId,
          tenantId: principal.tenantId,
          requestId,
        });

        return successResponse({
          versionId: version.versionId,
          fileId: version.fileId,
          size: version.size,
          mimeType: version.mimeType,
          createdAt: version.createdAt,
        }, requestId);
      } catch (err) {
        if (err instanceof FileFnError) return errorResponse(err, requestId);
        throw err;
      }
    },

    async proxyDownloadFile(request: Request, fileId: string, versionId?: string): Promise<Response> {
        const requestId = getRequestId(request);
        try {
            const principal = await requireAuth(request);
            await checkRateLimit('download', principal, rateLimits?.download);

            const result = await service.getDownloadStream(fileId, versionId, {
                principalId: principal.principalId,
                tenantId: principal.tenantId,
                requestId
            });

            return new Response(result.stream, {
                status: 200,
                headers: {
                    'Content-Type': result.contentType,
                    'Content-Length': result.size.toString(),
                    // 'Content-Disposition': `attachment; filename="file"` // Optional
                }
            });
        } catch (err) {
            if (err instanceof FileFnError) return errorResponse(err, requestId);
            throw err;
        }
    }
  };
}

export type FileRoutes = ReturnType<typeof createFileRoutes>;
