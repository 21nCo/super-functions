import type { UploadSessionService } from './service.js';
import type { FileFnPrincipal, AuthConfig } from '../auth.js';
import type { RateLimiter } from '@superfunctions/middleware';
import { resolvePrincipal } from '../auth.js';
import { FileFnError, authRequired, rateLimited } from '../errors.js';

export interface RouteContext {
  service: UploadSessionService;
  auth: AuthConfig;
  rateLimiter?: RateLimiter;
  rateLimits?: {
    uploadInit?: {
      windowSeconds: number;
      maxRequests: number;
    };
    uploadSign?: {
      windowSeconds: number;
      maxRequests: number;
    };
    uploadComplete?: {
      windowSeconds: number;
      maxRequests: number;
    };
  };
  legacyGlobalRateLimit?: boolean;
}

function getRequestId(request: Request): string | undefined {
  return request.headers.get('x-request-id') || undefined;
}

function getIdempotencyKey(request: Request): string | undefined {
  return request.headers.get('x-idempotency-key') || undefined;
}

function getUploadSessionToken(request: Request): string | undefined {
  return request.headers.get('x-upload-session-token') || undefined;
}

function successResponse(data: unknown, requestId?: string, warnings: string[] = []): Response {
  return Response.json(
    { ok: true, data, warnings, requestId },
    { status: 200 }
  );
}

function errorResponse(error: FileFnError, requestId?: string): Response {
  return Response.json(
    { ok: false, error: error.toJSON(), requestId },
    { status: error.statusCode }
  );
}

async function parseJsonBody<T>(request: Request): Promise<T> {
  return await request.json() as T;
}

export function createUploadSessionRoutes(ctx: RouteContext) {
  const { service, auth, rateLimiter, rateLimits, legacyGlobalRateLimit = false } = ctx;

  async function resolveCaller(request: Request): Promise<FileFnPrincipal | null> {
    const principal = await resolvePrincipal(request, auth);
    if (!principal && auth.required !== false) {
      throw authRequired();
    }
    return principal;
  }

  async function checkRateLimit(
    categoryKey: string,
    principal: FileFnPrincipal | null,
    categoryLimit?: { windowSeconds: number; maxRequests: number }
  ): Promise<void> {
    if (!rateLimiter) {
      return;
    }
    if (!categoryLimit && !legacyGlobalRateLimit) {
      return;
    }

    const result = await rateLimiter.check({
      key: `${categoryKey}:${principal?.tenantId || 'global'}:${principal?.principalId || 'anonymous'}`,
      windowSeconds: categoryLimit?.windowSeconds,
      limit: categoryLimit?.maxRequests,
    });
    if (!result.allowed) {
      throw rateLimited(result.resetAt);
    }
  }

  return {
    async initSession(request: Request): Promise<Response> {
      const requestId = getRequestId(request);
      try {
        const principal = await resolveCaller(request);
        await checkRateLimit('upload-init', principal, rateLimits?.uploadInit);

        const body = await parseJsonBody<{
          policy: string;
          fileName: string;
          size: number;
          mimeType: string;
          fileId?: string;
          metadata?: Record<string, unknown>;
        }>(request);

        const result = await service.createSession(
          { ...body, idempotencyKey: getIdempotencyKey(request) },
          { principalId: principal?.principalId, tenantId: principal?.tenantId, requestId }
        );

        return successResponse(result, requestId, result.warnings);
      } catch (err) {
        if (err instanceof FileFnError) {
          return errorResponse(err, requestId);
        }
        throw err;
      }
    },

    async getStatus(request: Request, uploadSessionId: string): Promise<Response> {
      const requestId = getRequestId(request);
      try {
        const principal = await resolveCaller(request);
        const result = await service.getSessionStatus(uploadSessionId, {
          principalId: principal?.principalId,
          tenantId: principal?.tenantId,
          requestId,
        }, getUploadSessionToken(request));
        return successResponse(result, requestId);
      } catch (err) {
        if (err instanceof FileFnError) {
          return errorResponse(err, requestId);
        }
        throw err;
      }
    },

    async signPart(request: Request, uploadSessionId: string, partNumber: number): Promise<Response> {
      const requestId = getRequestId(request);
      try {
        const principal = await resolveCaller(request);
        await checkRateLimit('upload-sign', principal, rateLimits?.uploadSign);

        const body = await parseJsonBody<{ contentLength: number; checksumSha256Base64?: string }>(request);
        const result = await service.signPart(uploadSessionId, partNumber, body.contentLength, {
          principalId: principal?.principalId,
          tenantId: principal?.tenantId,
          requestId,
        }, getUploadSessionToken(request));
        return successResponse(result, requestId);
      } catch (err) {
        if (err instanceof FileFnError) {
          return errorResponse(err, requestId);
        }
        throw err;
      }
    },

    async uploadPartBytes(request: Request, uploadSessionId: string, partNumber: number): Promise<Response> {
      const requestId = getRequestId(request);
      try {
        const principal = await resolveCaller(request);
        await checkRateLimit('upload-complete', principal, rateLimits?.uploadComplete);
        // Rate limit check for data plane might differ, but using sign limit for now or skipping
        // await checkRateLimit(`upload-part:${principal.principalId}`, requestId);

        const contentLength = parseInt(request.headers.get('content-length') || '0', 10);
        if (!request.body) {
          throw new FileFnError('FILEFN_INVALID_REQUEST', 'Missing request body', 400);
        }

        const result = await service.uploadPartBytes(uploadSessionId, partNumber, request.body, contentLength, {
          principalId: principal?.principalId,
          tenantId: principal?.tenantId,
          requestId,
        }, getUploadSessionToken(request));
        
        return successResponse({ ...result, recorded: true }, requestId);
      } catch (err) {
        if (err instanceof FileFnError) {
          return errorResponse(err, requestId);
        }
        throw err;
      }
    },

    async completePart(request: Request, uploadSessionId: string, partNumber: number): Promise<Response> {
      const requestId = getRequestId(request);
      try {
        const principal = await resolveCaller(request);
        const body = await parseJsonBody<{ etag: string; size: number; checksumSha256Base64?: string }>(request);
        await checkRateLimit('upload-complete', principal, rateLimits?.uploadComplete);

        await service.completePart(uploadSessionId, partNumber, body.etag, body.size, {
          principalId: principal?.principalId,
          tenantId: principal?.tenantId,
          requestId,
        }, getUploadSessionToken(request));
        return successResponse({ recorded: true }, requestId);
      } catch (err) {
        if (err instanceof FileFnError) {
          return errorResponse(err, requestId);
        }
        throw err;
      }
    },

    async completeSession(request: Request, uploadSessionId: string): Promise<Response> {
      const requestId = getRequestId(request);
      try {
        const principal = await resolveCaller(request);
        await checkRateLimit('upload-complete', principal, rateLimits?.uploadComplete);
        const result = await service.completeSession(uploadSessionId, {
          principalId: principal?.principalId,
          tenantId: principal?.tenantId,
          requestId,
        }, getUploadSessionToken(request));
        return successResponse(result, requestId);
      } catch (err) {
        if (err instanceof FileFnError) {
          return errorResponse(err, requestId);
        }
        throw err;
      }
    },

    async abortSession(request: Request, uploadSessionId: string): Promise<Response> {
      const requestId = getRequestId(request);
      try {
        const principal = await resolveCaller(request);
        await service.abortSession(uploadSessionId, {
          principalId: principal?.principalId,
          tenantId: principal?.tenantId,
          requestId,
        }, getUploadSessionToken(request));
        return successResponse({ aborted: true }, requestId);
      } catch (err) {
        if (err instanceof FileFnError) {
          return errorResponse(err, requestId);
        }
        throw err;
      }
    },
  };
}

export type UploadSessionRoutes = ReturnType<typeof createUploadSessionRoutes>;
