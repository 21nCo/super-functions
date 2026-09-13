import { constants } from "node:fs";
import { lstat, mkdir, open, rename, rm, realpath } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

/** Only use under a caller-owned directory, never concurrently writable by a review target. */
export async function safeDirectory(directory: string): Promise<void> {
  const absolute = path.resolve(directory);
  const parent = path.dirname(absolute);
  if (parent !== absolute) await safeDirectory(parent);
  try { await mkdir(absolute, { mode: 0o700 }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  const stat = await lstat(absolute);
  // macOS installs these root-owned aliases; repository-controlled aliases remain forbidden.
  if (process.platform === "darwin" && stat.uid === 0 && ["/var", "/tmp", "/etc"].includes(absolute) && await realpath(absolute) === `/private${absolute}`) return;
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Expected real directory; refusing non-directory or symlink: ${absolute}`);
}
export async function safeRead(file: string, maxBytes = 32 * 1024 * 1024): Promise<Buffer> {
  if (/[\\/]$/.test(file)) throw new Error("Expected a file path, not a directory-form path.");
  file = path.resolve(file);
  await safeDirectory(path.dirname(file));
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new Error("Read budget must be a positive integer.");
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > maxBytes) throw new Error(`Expected a regular file within the ${maxBytes}-byte read budget.`);
    const chunks: Buffer[] = []; let bytes = 0;
    while (true) {
      const buffer = Buffer.alloc(Math.min(64 * 1024, maxBytes - bytes + 1));
      const count = (await handle.read(buffer, 0, buffer.length, null)).bytesRead;
      if (!count) break;
      bytes += count;
      if (bytes > maxBytes) throw new Error("File exceeds the read budget.");
      chunks.push(buffer.subarray(0, count));
    }
    return Buffer.concat(chunks, bytes);
  } finally { await handle.close(); }
}
export async function safeWrite(file: string, content: string | Uint8Array): Promise<void> {
  if (/[\\/]$/.test(file)) throw new Error("Expected a file path, not a directory-form path.");
  file = path.resolve(file);
  await safeDirectory(path.dirname(file));
  const stat = await lstat(file).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? undefined : Promise.reject(error));
  if (stat && !stat.isFile()) throw new Error("Refusing non-regular output file.");
  const temporary = `${file}.${randomUUID()}.tmp`;
  const handle = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
  try {
    try { await handle.writeFile(content); await handle.sync(); } finally { await handle.close(); }
    await rename(temporary, file);
  } finally { await rm(temporary, { force: true }); }
}
