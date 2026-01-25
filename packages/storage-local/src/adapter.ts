import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, stat, unlink, realpath } from 'node:fs/promises';
import { dirname, join, normalize, resolve, isAbsolute } from 'node:path';
import type { StorageAdapter, StorageAdapterCapabilities, StorageObjectStat } from '@superfunctions/storage';

export interface LocalStorageConfig {
  rootDir: string;
}

export function createLocalStorageAdapter(config: LocalStorageConfig): StorageAdapter {
  const { rootDir } = config;

  const normalizedRoot = resolve(normalize(rootDir));
  let resolvedRoot: string | null = null;

  async function getResolvedRoot(): Promise<string> {
    if (resolvedRoot === null) {
      try {
        resolvedRoot = await realpath(normalizedRoot);
      } catch {
        resolvedRoot = normalizedRoot;
      }
    }
    return resolvedRoot;
  }

  const capabilities: StorageAdapterCapabilities = {
    signedUploadUrls: false,
    signedDownloadUrls: false,
    multipart: false,
    proxyStreamingUpload: true,
    proxyStreamingDownload: true,
  };

  function validateKey(key: string): void {
    if (!key || key.length === 0) {
      throw new Error('Invalid key: key cannot be empty');
    }

    if (isAbsolute(key)) {
      throw new Error('Invalid key: absolute paths are not allowed');
    }

    const normalizedKey = normalize(key);

    if (normalizedKey.startsWith('..') || normalizedKey.includes('/..') || normalizedKey.includes('\\..')) {
      throw new Error('Invalid key: path traversal detected');
    }

    const forbidden = ['\0', ':', '*', '?', '"', '<', '>', '|'];
    for (const char of forbidden) {
      if (key.includes(char)) {
        throw new Error(`Invalid key: forbidden character '${char}'`);
      }
    }
  }

  function resolvePath(key: string): string {
    validateKey(key);

    const resolved = join(normalizedRoot, normalize(key));

    if (!resolved.startsWith(normalizedRoot + '/') && resolved !== normalizedRoot) {
      throw new Error('Invalid key: path traversal detected');
    }

    return resolved;
  }

  async function validateResolvedPath(filePath: string): Promise<void> {
    try {
      const real = await realpath(filePath);
      const root = await getResolvedRoot();
      if (!real.startsWith(root + '/') && real !== root) {
        throw new Error('Invalid key: path traversal detected via symlink');
      }
    } catch (err: unknown) {
      if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
        return;
      }
      throw err;
    }
  }

  return {
    name: 'local',
    capabilities,

    async statObject(input: { key: string }): Promise<StorageObjectStat> {
      const filePath = resolvePath(input.key);

      try {
        await validateResolvedPath(filePath);
        const stats = await stat(filePath);

        if (!stats.isFile()) {
          const error = new Error('Object not found') as Error & { code: string };
          error.code = 'STORAGE_NOT_FOUND';
          throw error;
        }

        return {
          key: input.key,
          size: stats.size,
          lastModifiedAt: stats.mtime.toISOString(),
        };
      } catch (err: unknown) {
        if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
          const error = new Error('Object not found') as Error & { code: string };
          error.code = 'STORAGE_NOT_FOUND';
          throw error;
        }
        throw err;
      }
    },

    async deleteObject(input: { key: string }): Promise<void> {
      const filePath = resolvePath(input.key);

      try {
        await validateResolvedPath(filePath);
        await unlink(filePath);
      } catch (err: unknown) {
        if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
          return;
        }
        throw err;
      }
    },

    async openUploadStream(input: { key: string; contentType?: string }): Promise<WritableStream> {
      const filePath = resolvePath(input.key);
      const dir = dirname(filePath);

      await mkdir(dir, { recursive: true });

      const dirRealPath = await realpath(dir);
      const root = await getResolvedRoot();
      if (!dirRealPath.startsWith(root + '/') && dirRealPath !== root) {
        throw new Error('Invalid key: path traversal detected via symlink');
      }

      const nodeStream = createWriteStream(filePath);

      return new WritableStream({
        write(chunk) {
          return new Promise((resolve, reject) => {
            const buffer = chunk instanceof Uint8Array ? Buffer.from(chunk) : chunk;
            const ok = nodeStream.write(buffer);
            if (ok) {
              resolve();
            } else {
              nodeStream.once('drain', resolve);
              nodeStream.once('error', reject);
            }
          });
        },
        close() {
          return new Promise((resolve, reject) => {
            nodeStream.end(() => resolve());
            nodeStream.once('error', reject);
          });
        },
        abort(reason) {
          nodeStream.destroy(reason instanceof Error ? reason : new Error(String(reason)));
        },
      });
    },

    async openDownloadStream(input: {
      key: string;
      range?: { start: number; endInclusive: number };
    }): Promise<ReadableStream> {
      const filePath = resolvePath(input.key);

      try {
        await validateResolvedPath(filePath);
        const stats = await stat(filePath);

        if (!stats.isFile()) {
          const error = new Error('Object not found') as Error & { code: string };
          error.code = 'STORAGE_NOT_FOUND';
          throw error;
        }

        if (input.range) {
          if (input.range.start < 0) {
            throw new Error('Invalid range: start must be non-negative');
          }
          if (input.range.endInclusive < input.range.start) {
            throw new Error('Invalid range: end must be >= start');
          }
          if (input.range.start >= stats.size) {
            throw new Error('Invalid range: start beyond file size');
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
          const error = new Error('Object not found') as Error & { code: string };
          error.code = 'STORAGE_NOT_FOUND';
          throw error;
        }
        throw err;
      }

      const options = input.range
        ? { start: input.range.start, end: input.range.endInclusive }
        : undefined;

      const nodeStream = createReadStream(filePath, options);

      return new ReadableStream({
        start(controller) {
          nodeStream.on('data', (chunk: Buffer | string) => {
            const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
            controller.enqueue(new Uint8Array(buffer));
          });
          nodeStream.on('end', () => {
            controller.close();
          });
          nodeStream.on('error', (err) => {
            controller.error(err);
          });
        },
        cancel() {
          nodeStream.destroy();
        },
      });
    },
  };
}
