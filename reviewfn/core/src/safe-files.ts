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
export async function safeRead(file: string): Promise<Buffer> {
  await safeDirectory(path.dirname(file));
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 32 * 1024 * 1024) throw new Error("Expected a regular file within the 32 MiB read budget.");
    return await handle.readFile();
  } finally { await handle.close(); }
}
export async function safeWrite(file: string, content: string | Uint8Array): Promise<void> {
  await safeDirectory(path.dirname(file));
  const stat = await lstat(file).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? undefined : Promise.reject(error));
  if (stat && !stat.isFile()) throw new Error("Refusing non-regular output file.");
  const temporary = `${file}.${randomUUID()}.tmp`;
  const handle = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
  try { await handle.writeFile(content); await handle.sync(); }
  finally { await handle.close(); }
  try { await rename(temporary, file); } finally { await rm(temporary, { force: true }); }
}
