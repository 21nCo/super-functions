import type { GrantsService } from './grants.service.js';
import type { FileFnPrincipal, AuthConfig } from '../auth.js';
import { resolvePrincipal } from '../auth.js';
import { FileFnError, authRequired } from '../errors.js';

export interface GrantsRouteContext {
  service: GrantsService;
  auth: AuthConfig;
}

function getRequestId(request: Request): string | undefined {
  return request.headers.get('x-request-id') || undefined;
}

function successResponse(data: unknown, requestId?: string): Response {
  return Response.json({ ok: true, data, requestId }, { status: 200 });
}

function createdResponse(data: unknown, requestId?: string): Response {
  return Response.json({ ok: true, data, requestId }, { status: 201 });
}

function errorResponse(error: FileFnError, requestId?: string): Response {
  return Response.json({ ok: false, error: error.toJSON(), requestId }, { status: error.statusCode });
}

export function createGrantsRoutes(ctx: GrantsRouteContext) {
  const { service, auth } = ctx;

  async function requireAuth(request: Request): Promise<FileFnPrincipal> {
    const principal = await resolvePrincipal(request, auth);
    if (!principal && auth.required !== false) {
      throw authRequired();
    }
    return principal || { principalId: 'anonymous' };
  }

  return {
    async createGrant(request: Request, fileId: string): Promise<Response> {
      const requestId = getRequestId(request);
      try {
        const principal = await requireAuth(request);
        const body = await request.json() as {
          userId?: string;
          role?: string;
          tenantId?: string;
          canRead?: boolean;
          canWrite?: boolean;
          canDelete?: boolean;
          canShare?: boolean;
          expiresAt?: string;
        };

        const grant = await service.createGrant(
          {
            fileId,
            userId: body.userId,
            role: body.role,
            tenantId: body.tenantId,
            canRead: body.canRead,
            canWrite: body.canWrite,
            canDelete: body.canDelete,
            canShare: body.canShare,
            expiresAt: body.expiresAt,
          },
          { principalId: principal.principalId, tenantId: principal.tenantId, requestId }
        );

        return createdResponse(grant, requestId);
      } catch (err) {
        if (err instanceof FileFnError) return errorResponse(err, requestId);
        throw err;
      }
    },

    async listGrants(request: Request, fileId: string): Promise<Response> {
      const requestId = getRequestId(request);
      try {
        const principal = await requireAuth(request);
        const grants = await service.listGrants(fileId, {
          principalId: principal.principalId,
          tenantId: principal.tenantId,
          requestId,
        });

        return successResponse({ permissions: grants }, requestId);
      } catch (err) {
        if (err instanceof FileFnError) return errorResponse(err, requestId);
        throw err;
      }
    },

    async revokeGrant(request: Request, fileId: string, permissionId: string): Promise<Response> {
      const requestId = getRequestId(request);
      try {
        const principal = await requireAuth(request);
        await service.revokeGrant(fileId, permissionId, {
          principalId: principal.principalId,
          tenantId: principal.tenantId,
          requestId,
        });

        return successResponse({ revoked: true }, requestId);
      } catch (err) {
        if (err instanceof FileFnError) return errorResponse(err, requestId);
        throw err;
      }
    },
  };
}

export type GrantsRoutes = ReturnType<typeof createGrantsRoutes>;
