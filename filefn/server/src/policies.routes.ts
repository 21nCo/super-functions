import type { PolicyRegistry } from './policies.js';
import type { AuthConfig } from './auth.js';

export interface PolicyRoutesContext {
  policyRegistry: PolicyRegistry;
  auth: AuthConfig;
}

function getRequestId(request: Request): string | undefined {
  return request.headers.get('x-request-id') || undefined;
}

function successResponse(data: unknown, requestId?: string): Response {
  return Response.json({ ok: true, data, requestId }, { status: 200 });
}

export function createPolicyRoutes(ctx: PolicyRoutesContext) {
  const { policyRegistry } = ctx;

  return {
    async listPolicies(request: Request): Promise<Response> {
      const requestId = getRequestId(request);

      const policies = policyRegistry.list().map((p) => ({
        name: p.name,
        maxSizeBytes: p.maxSizeBytes,
        contentTypes: p.contentTypes,
        visibility: p.visibility,
      }));

      return successResponse({ policies }, requestId);
    },
  };
}

export type PolicyRoutes = ReturnType<typeof createPolicyRoutes>;
