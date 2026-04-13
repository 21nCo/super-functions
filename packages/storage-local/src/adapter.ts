import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, lstat, stat, unlink, realpath } from 'node:fs/promises';
import { dirname, join, normalize, resolve, isAbsolute, relative } from 'node:path';
import type { StorageAdapter, StorageAdapterCapabilities, StorageObjectStat } from '@superfunctions/storage';
import { createNotFoundError } from '@superfunctions/storage/internal/errors';

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

  function isWithinRoot(root: string, candidate: string): boolean {
    const rel = relative(root, candidate);
    return rel !== '..' && !rel.startsWith(`..${'/'}`) && !rel.startsWith(`..${'\\'}`) && !isAbsolute(rel);
  }

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

    if (!isWithinRoot(normalizedRoot, resolved)) {
      throw new Error('Invalid key: path traversal detected');
    }

    return resolved;
  }

  async function validateResolvedPath(filePath: string): Promise<void> {
    try {
      const real = await realpath(filePath);
      const root = await getResolvedRoot();
      if (!isWithinRoot(root, real)) {
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
          throw createNotFoundError();
        }

        return {
          key: input.key,
          size: stats.size,
          lastModifiedAt: stats.mtime.toISOString(),
        };
      } catch (err: unknown) {
        if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
          throw createNotFoundError();
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
      if (!isWithinRoot(root, dirRealPath)) {
        throw new Error('Invalid key: path traversal detected via symlink');
      }
      try {
        const fileStats = await lstat(filePath);
        if (fileStats.isSymbolicLink()) {
          throw new Error('Invalid key: upload target cannot be a symlink');
        }
      } catch (err: unknown) {
        if (!(err instanceof Error && 'code' in err && err.code === 'ENOENT')) {
          throw err;
        }
      }

      const nodeStream = createWriteStream(filePath);
      let streamError: Error | null = null;
      nodeStream.on('error', (err) => {
        streamError = err;
      });

      return new WritableStream({
        write(chunk) {
          return new Promise((resolve, reject) => {
            if (streamError) {
              reject(streamError);
              return;
            }
            const buffer = chunk instanceof Uint8Array ? Buffer.from(chunk) : chunk;
            const ok = nodeStream.write(buffer);
            if (ok) {
              resolve();
            } else {
              const cleanup = () => {
                nodeStream.off('drain', onDrain);
                nodeStream.off('error', onError);
              };
              const onDrain = () => {
                cleanup();
                resolve();
              };
              const onError = (err: Error) => {
                cleanup();
                reject(err);
              };
              nodeStream.once('drain', onDrain);
              nodeStream.once('error', onError);
            }
          });
        },
        close() {
          return new Promise((resolve, reject) => {
            if (streamError) {
              reject(streamError);
              return;
            }
            const cleanup = () => {
              nodeStream.off('finish', onFinish);
              nodeStream.off('error', onError);
            };
            const onFinish = () => {
              cleanup();
              resolve(undefined);
            };
            const onError = (err: Error) => {
              cleanup();
              reject(err);
            };
            nodeStream.once('finish', onFinish);
            nodeStream.once('error', onError);
            nodeStream.end();
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
          throw createNotFoundError();
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
          throw createNotFoundError();
        }
        throw err;
      }

      const options = input.range
        ? { start: input.range.start, end: input.range.endInclusive }
        : undefined;

      const nodeStream = createReadStream(filePath, options);
      nodeStream.pause();

      return new ReadableStream({
        start(controller) {
          nodeStream.on('data', (chunk: Buffer | string) => {
            const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
            controller.enqueue(new Uint8Array(buffer));
            nodeStream.pause();
          });
          nodeStream.on('end', () => {
            controller.close();
          });
          nodeStream.on('error', (err) => {
            controller.error(err);
          });
        },
        pull() {
          nodeStream.resume();
        },
        cancel() {
          nodeStream.destroy();
        },
      });
    },
  };
}
