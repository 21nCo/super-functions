export interface FileFnPrincipal {
  principalId: string;
  tenantId?: string;
  roles?: string[];
}

export interface AuthProvider {
  authenticate?(request: Request): Promise<{ principalId: string; tenantId?: string; roles?: string[] } | null>;
  getSession?(request: Request): Promise<{ principalId: string; tenantId?: string; roles?: string[] } | null>;
}

export interface AuthConfig {
  provider?: AuthProvider;
  resolveSession?: (request: Request) => Promise<FileFnPrincipal | null>;
  required?: boolean;
}

export async function resolvePrincipal(
  request: Request,
  config: AuthConfig
): Promise<FileFnPrincipal | null> {
  // 1. Try custom resolveSession first
  if (config.resolveSession) {
    const principal = await config.resolveSession(request);
    if (principal) return principal;
  }

  // 2. Try provider.getSession (cached session lookup)
  if (config.provider?.getSession) {
    const session = await config.provider.getSession(request);
    if (session) {
      return {
        principalId: session.principalId,
        tenantId: session.tenantId,
        roles: session.roles,
      };
    }
  }

  // 3. Try provider.authenticate (full authentication)
  if (config.provider?.authenticate) {
    const session = await config.provider.authenticate(request);
    if (session) {
      return {
        principalId: session.principalId,
        tenantId: session.tenantId,
        roles: session.roles,
      };
    }
  }

  return null;
}

export function isAnonymousPrincipal(
  principal: FileFnPrincipal | null | undefined
): boolean {
  return !principal || !principal.principalId || principal.principalId === 'anonymous';
}
