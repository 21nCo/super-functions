import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

type Identity = { hash: string; dev: string; ino: string; temporary?: string };
type Ownership = Record<string, Array<Identity | string>>;
const digest = (content: string) => createHash("sha256").update(content).digest("hex");

async function inspect(file: string) {
  try {
    const info = await fs.lstat(file, { bigint: true });
    if (!info.isFile()) throw new Error(`Artifact destination must be a regular file: ${file}`);
    return info;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function readOwnership(file: string): Promise<Ownership> {
  const info = await inspect(file);
  if (!info) return {};
  if (info.size > 65536n) throw new Error("Artifact ownership record exceeds 64 KiB");
  let input: unknown;
  try { input = JSON.parse(await fs.readFile(file, "utf8")); }
  catch (error) { if (error instanceof SyntaxError) throw new Error("Artifact ownership record is invalid"); throw error; }
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Artifact ownership record is invalid");
  const result: Ownership = Object.create(null);
  for (const [name, value] of Object.entries(input)) {
    const records = Array.isArray(value) ? value : [value];
    result[name] = records.filter((record): record is Identity | string =>
      typeof record === "string" ? /^[a-f0-9]{64}$/.test(record)
        : !!record && typeof record === "object" && typeof record.hash === "string" && /^[a-f0-9]{64}$/.test(record.hash) && typeof record.dev === "string" && typeof record.ino === "string",
    );
  }
  return result;
}

async function currentIdentity(file: string): Promise<Identity | undefined> {
  const info = await inspect(file);
  if (!info) return undefined;
  return { hash: digest(await fs.readFile(file, "utf8")), dev: String(info.dev), ino: String(info.ino) };
}
function owns(current: Identity, records: Array<Identity | string> = []): boolean {
  return records.some(record => typeof record === "string" ? record === current.hash
    : record.hash === current.hash && record.dev === current.dev && record.ino === current.ino);
}

/** Publish complete files and invalidate only provably owned files on failure.
 * The selected directory is trusted; this is not protection against concurrent
 * filesystem replacement by another actor. A journal permits crash recovery.
 * Each call must provide the complete namespace, using undefined for removals.
 */
export async function publishOwnedArtifacts(
  directory: string,
  marker: string,
  artifacts: Record<string, string | undefined>,
): Promise<string[]> {
  const names = Object.keys(artifacts);
  for (const name of [marker, ...names]) {
    if (!name || name === "." || name === ".." || path.basename(name) !== name || /[\\/]/.test(name)) throw new Error("Artifact names must be single path segments");
  }
  if (names.includes(marker)) throw new Error("Artifact marker must be separate from outputs");
  const cleanupOnly = Object.values(artifacts).every(content => content === undefined);
  if (cleanupOnly && !(await inspect(path.join(directory, marker)))) {
    const preserved: string[] = [];
    for (const name of names) if (await inspect(path.join(directory, name))) preserved.push(name);
    return preserved;
  }
  await fs.mkdir(directory, { recursive: true });
  const markerPath = path.join(directory, marker);
  let ownership = await readOwnership(markerPath);
  for (const name of names) for (const record of ownership[name] ?? []) {
    if (typeof record === "string" || typeof record.temporary !== "string" || !/^\.docsfn-artifact-[0-9a-f-]+\.tmp$/.test(record.temporary)) continue;
    const file = path.join(directory, record.temporary);
    const current = await currentIdentity(file);
    if (current && owns(current, [record])) await fs.rm(file);
  }
  const temporary = new Set<string>();
  const stage = async (content: string): Promise<string> => {
    const file = path.join(directory, `.docsfn-artifact-${randomUUID()}.tmp`);
    const handle = await fs.open(file, "wx");
    temporary.add(file);
    try { await handle.writeFile(content); } finally { await handle.close(); }
    return file;
  };
  const saveOwnership = async (value: Ownership): Promise<void> => {
    const staged = await stage(JSON.stringify(value));
    await fs.rename(staged, markerPath);
    temporary.delete(staged);
  };
  const removeOwned = async (keys: string[]): Promise<string[]> => {
    const preserved: string[] = [];
    const errors: unknown[] = [];
    for (const name of keys) {
      try {
        const file = path.join(directory, name);
        const current = await currentIdentity(file);
        if (!current) continue;
        if (owns(current, ownership[name])) await fs.rm(file);
        else preserved.push(name);
      } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, "Some owned artifacts could not be inspected or removed");
    return preserved;
  };
  try {
    const retained: Ownership = Object.create(null);
    for (const name of names) {
      const current = await currentIdentity(path.join(directory, name));
      if (current && owns(current, ownership[name])) retained[name] = [current];
    }
    const staged = new Map<string, string>();
    const completed: Ownership = Object.create(null);
    for (const [name, content] of Object.entries(artifacts)) {
      if (content === undefined) continue;
      const file = await stage(content);
      const identity = { ...(await currentIdentity(file))!, temporary: path.basename(file) };
      staged.set(name, file);
      completed[name] = [identity];
      retained[name] = [...(retained[name] ?? []), identity];
    }
    // Write the journal before publication. Inode + digest prevents a failed
    // attempt from claiming an identical but never-replaced hand-maintained file.
    await saveOwnership(retained);
    ownership = retained;
    for (const [name, file] of staged) {
      await fs.rename(file, path.join(directory, name));
      temporary.delete(file);
    }
    const preserved = await removeOwned(names.filter(name => artifacts[name] === undefined));
    await saveOwnership(completed);
    return preserved;
  } catch (error) {
    try { await removeOwned(names); }
    catch (cleanup) { throw new AggregateError([error, cleanup], "Artifact publication and owned-output cleanup failed"); }
    throw error;
  } finally {
    for (const file of temporary) await fs.rm(file, { force: true });
  }
}
