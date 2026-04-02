import type { FileFnPrincipal, AuthConfig } from './auth.js';
import type { QuotaProvider } from './upload-sessions/service.js';
import { resolvePrincipal } from './auth.js';
import { FileFnError, authRequired, notFound } from './errors.js';

export interface QuotaRoutesContext {
  quota?: QuotaProvider;
  auth: AuthConfig;
}

function getRequestId(request: Request): string | undefined {
  return request.headers.get('x-request-id') || undefined;
}

function successResponse(data: unknown, requestId?: string): Response {
  return Response.json({ ok: true, data, requestId }, { status: 200 });
}

function errorResponse(error: FileFnError, requestId?: string): Response {
  return Response.json({ ok: false, error: error.toJSON(), requestId }, { status: error.statusCode });
}

export function createQuotaRoutes(ctx: QuotaRoutesContext) {
  const { quota, auth } = ctx;

  async function requireAuth(request: Request): Promise<FileFnPrincipal> {
    const principal = await resolvePrincipal(request, auth);
    if (!principal && auth.required !== false) {
      throw authRequired();
    }
    return principal || { principalId: 'anonymous' };
  }

  return {
    async getStorageQuota(request: Request): Promise<Response> {
      const requestId = getRequestId(request);
      try {
        const principal = await requireAuth(request);

        if (!quota?.getUsage) {
          throw notFound('Quota');
        }

        const usage = await quota.getUsage(principal.principalId, principal.tenantId);
        return successResponse(usage, requestId);
      } catch (err) {
        if (err instanceof FileFnError) return errorResponse(err, requestId);
        throw err;
      }
    },
  };
}

export type QuotaRoutes = ReturnType<typeof createQuotaRoutes>;
