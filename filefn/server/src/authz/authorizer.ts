import type { Adapter } from '@superfunctions/db';
import type { FileProviderContext } from '@superfunctions/files';
import type { FileRecord, Authorizer } from '../files/service.js';

export type AuthorizerStrategy = 'first-allow' | 'all-must-allow';

export interface ComposeAuthorizersOptions {
  strategy: AuthorizerStrategy;
}

/**
 * Compose multiple authorizers into a single authorizer.
 * 
 * @param authorizers - Array of authorizers to compose
 * @param options - Composition options including strategy
 * @returns A composed authorizer
 * 
 * Strategies:
 * - 'first-allow': Allow if ANY authorizer allows (OR logic)
 * - 'all-must-allow': Allow only if ALL authorizers allow (AND logic)
 */
export function composeAuthorizers(
  authorizers: Authorizer[],
  options?: ComposeAuthorizersOptions
): Authorizer {
  const strategy = options?.strategy ?? 'first-allow';

  if (authorizers.length === 0) {
    return {
      async canRead() { return false; },
      async canWrite() { return false; },
      async canDelete() { return false; },
    };
  }

  if (strategy === 'first-allow') {
    return {
      async canRead(file, ctx) {
        for (const auth of authorizers) {
          if (await auth.canRead(file, ctx)) return true;
        }
        return false;
      },
      async canWrite(file, ctx) {
        for (const auth of authorizers) {
          if (await auth.canWrite(file, ctx)) return true;
        }
        return false;
      },
      async canDelete(file, ctx) {
        for (const auth of authorizers) {
          if (await auth.canDelete(file, ctx)) return true;
        }
        return false;
      },
    };
  }

  return {
    async canRead(file, ctx) {
      for (const auth of authorizers) {
        if (!(await auth.canRead(file, ctx))) return false;
      }
      return true;
    },
    async canWrite(file, ctx) {
      for (const auth of authorizers) {
        if (!(await auth.canWrite(file, ctx))) return false;
      }
      return true;
    },
    async canDelete(file, ctx) {
      for (const auth of authorizers) {
        if (!(await auth.canDelete(file, ctx))) return false;
      }
      return true;
    },
  };
}

export interface FilePermissionRecord {
  permissionId: string;
  fileId: string;
  userId: string | null;
  role: string | null;
  tenantId: string | null;
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
  canShare: boolean;
  expiresAt: string | null;
  createdAt: string;
}

export interface DefaultAuthorizerConfig {
  db: Adapter;
  namespace?: string;
  adminRoles?: string[];
}

export interface DefaultAuthorizerContext extends FileProviderContext {
  roles?: string[];
}

export function createDefaultAuthorizer(config: DefaultAuthorizerConfig): Authorizer {
  const { db, namespace = 'filefn', adminRoles = ['admin'] } = config;

  function isGrantExpired(expiresAt: string | null): boolean {
    if (!expiresAt) {
      return false;
    }
    const expiresAtMs = Date.parse(expiresAt);
    if (Number.isNaN(expiresAtMs)) {
      return true;
    }
    return expiresAtMs <= Date.now();
  }

  async function getApplicableGrants(
    fileId: string,
    ctx: DefaultAuthorizerContext
  ): Promise<FilePermissionRecord[]> {
    const grants = await db.findMany<FilePermissionRecord>({
      model: 'filePermissions',
      where: [{ field: 'fileId', operator: 'eq', value: fileId }],
      namespace,
    });

    return grants.filter(grant => {
      if (isGrantExpired(grant.expiresAt)) return false;

      if (grant.userId && grant.userId === ctx.principalId) return true;
      if (grant.role && ctx.roles?.includes(grant.role)) return true;
      if (grant.tenantId && grant.tenantId === ctx.tenantId) return true;

      return false;
    });
  }

  function isAdmin(ctx: DefaultAuthorizerContext): boolean {
    return ctx.roles?.some(role => adminRoles.includes(role)) ?? false;
  }

  function isOwner(file: FileRecord, ctx: FileProviderContext): boolean {
    return file.ownerId === ctx.principalId;
  }

  return {
    async canRead(file, ctx) {
      if (isOwner(file, ctx)) return true;
      if (isAdmin(ctx as DefaultAuthorizerContext)) return true;
      if (file.visibility === 'public') return true;
      if (file.visibility === 'shared' && file.tenantId && file.tenantId === ctx.tenantId) return true;

      const grants = await getApplicableGrants(file.fileId, ctx as DefaultAuthorizerContext);
      return grants.some(g => g.canRead);
    },

    async canWrite(file, ctx) {
      if (isOwner(file, ctx)) return true;
      if (isAdmin(ctx as DefaultAuthorizerContext)) return true;

      const grants = await getApplicableGrants(file.fileId, ctx as DefaultAuthorizerContext);
      return grants.some(g => g.canWrite);
    },

    async canDelete(file, ctx) {
      if (isOwner(file, ctx)) return true;
      if (isAdmin(ctx as DefaultAuthorizerContext)) return true;

      const grants = await getApplicableGrants(file.fileId, ctx as DefaultAuthorizerContext);
      return grants.some(g => g.canDelete);
    },
  };
}
