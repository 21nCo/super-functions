import type { Adapter } from '@superfunctions/db';
import type { FileProviderContext } from '@superfunctions/files';
import type { FileRecord } from '../files/service.js';
import type { FilePermissionRecord } from './authorizer.js';
import { randomUUID } from 'crypto';
import * as errors from '../errors.js';

export interface GrantsServiceConfig {
  db: Adapter;
  namespace?: string;
}

export interface CreateGrantInput {
  fileId: string;
  userId?: string;
  role?: string;
  tenantId?: string;
  canRead?: boolean;
  canWrite?: boolean;
  canDelete?: boolean;
  canShare?: boolean;
  expiresAt?: string;
}

export function createGrantsService(config: GrantsServiceConfig) {
  const { db, namespace = 'filefn' } = config;

  async function getFile(fileId: string): Promise<FileRecord | null> {
    return db.findOne<FileRecord>({
      model: 'files',
      where: [{ field: 'fileId', operator: 'eq', value: fileId }],
      namespace,
    });
  }

  async function canManagePermissions(file: FileRecord, ctx: FileProviderContext): Promise<boolean> {
    return file.ownerId === ctx.principalId;
  }

  return {
    async createGrant(input: CreateGrantInput, ctx: FileProviderContext): Promise<FilePermissionRecord> {
      const file = await getFile(input.fileId);
      if (!file) {
        throw errors.notFound('File');
      }

      const canManage = await canManagePermissions(file, ctx);
      if (!canManage) {
        throw errors.forbidden();
      }

      if (!input.userId && !input.role && !input.tenantId) {
        throw new errors.FileFnError('FILEFN_INVALID_GRANT', 'Grant must specify userId, role, or tenantId', 400);
      }

      const permission: FilePermissionRecord = {
        permissionId: randomUUID(),
        fileId: input.fileId,
        userId: input.userId || null,
        role: input.role || null,
        tenantId: input.tenantId || null,
        canRead: input.canRead ?? true,
        canWrite: input.canWrite ?? false,
        canDelete: input.canDelete ?? false,
        canShare: input.canShare ?? false,
        expiresAt: input.expiresAt || null,
        createdAt: new Date().toISOString(),
      };

      await db.create({
        model: 'filePermissions',
        data: permission,
        namespace,
      });

      return permission;
    },

    async listGrants(fileId: string, ctx: FileProviderContext): Promise<FilePermissionRecord[]> {
      const file = await getFile(fileId);
      if (!file) {
        throw errors.notFound('File');
      }

      const canManage = await canManagePermissions(file, ctx);
      if (!canManage) {
        throw errors.forbidden();
      }

      return db.findMany<FilePermissionRecord>({
        model: 'filePermissions',
        where: [{ field: 'fileId', operator: 'eq', value: fileId }],
        namespace,
      });
    },

    async revokeGrant(fileId: string, permissionId: string, ctx: FileProviderContext): Promise<void> {
      const file = await getFile(fileId);
      if (!file) {
        throw errors.notFound('File');
      }

      const canManage = await canManagePermissions(file, ctx);
      if (!canManage) {
        throw errors.forbidden();
      }

      const permission = await db.findOne<FilePermissionRecord>({
        model: 'filePermissions',
        where: [
          { field: 'permissionId', operator: 'eq', value: permissionId },
          { field: 'fileId', operator: 'eq', value: fileId },
        ],
        namespace,
      });

      if (!permission) {
        throw errors.permissionNotFound();
      }

      await db.delete({
        model: 'filePermissions',
        where: [{ field: 'permissionId', operator: 'eq', value: permissionId }],
        namespace,
      });
    },
  };
}

export type GrantsService = ReturnType<typeof createGrantsService>;
