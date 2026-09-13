import { lstat, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { safeDirectory, sha256 } from "@superfunctions/reviewfn-core";

/** Exclusive local lease; interrupted acquisition requires operator cleanup. CI also needs cross-machine concurrency. */
export async function publicationLease(identity: string): Promise<() => Promise<void>> {
  const root = path.join(tmpdir(), `reviewfn-publication-${process.getuid?.() ?? "user"}`);
  await safeDirectory(root);
  const rootStat = await lstat(root);
  if ((process.getuid && rootStat.uid !== process.getuid()) || (rootStat.mode & 0o077) !== 0) throw new Error("Publication lease root must be private and owned by the current user.");
  const directory = path.join(root, sha256(identity));
  try { await mkdir(directory, { mode: 0o700 }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    // Never steal a timed-out lease: a paused publisher might still resume and write.
    throw new Error("Publication lease is held. Retry after the active publisher finishes; after a crash, an operator must verify the recorded process is dead before removing its lease.");
  }
  const ticket = randomUUID();
  const owner = JSON.stringify({ pid: process.pid, ticket, createdAt: new Date().toISOString() });
  try { await writeFile(path.join(directory, "owner.json"), owner, { flag: "wx", mode: 0o600 }); }
  catch (error) { await rm(directory, { recursive: true, force: true }); throw error; }
  return async () => {
    if (await readFile(path.join(directory, "owner.json"), "utf8") !== owner) throw new Error("Publication lease ownership changed; refusing cleanup.");
    await rm(directory, { recursive: true });
  };
}
