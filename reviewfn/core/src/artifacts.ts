import { constants } from "node:fs";
import { lstat, open, readdir, rm } from "node:fs/promises";
import path from "node:path";

import { safeDirectory, safeRead, safeWrite } from "./safe-files.js";
import { sha256 } from "./canonical.js";
import { ReviewFnError } from "./errors.js";
import type { ArtifactStore } from "./types.js";

interface ArtifactMetadata { id: string; digest: string; kind: string; createdAt: string; expiresAt: string }

function validateKind(kind: string): void {
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(kind)) throw new ReviewFnError("REVIEWFN_ARTIFACT_UNSAFE", `Unsafe artifact kind ${kind}.`);
}

export class FileArtifactStore implements ArtifactStore {
  public constructor(private readonly root: string, private readonly reportCopiesDirectory?: string) {}

  public put(kind: string, content: string | Uint8Array, retentionDays: number) { return this.withLease(() => this.putUnlocked(kind, content, retentionDays)); }
  public importFrom(sourceRoot: string) { return this.withLease(() => this.importUnlocked(sourceRoot)); }
  public writeReportCopies(json: string, markdown: string, retentionDays: number) { return this.withLease(() => this.writeCopiesUnlocked(json, markdown, retentionDays)); }
  public deleteExpired(now = new Date()) { return this.withLease(() => this.deleteExpiredUnlocked(now)); }

  private async withLease<T>(action: () => Promise<T>): Promise<T> {
    await this.ensureSafeRoot();
    const file = path.join(this.root, ".retention.lock");
    let handle;
    for (let attempt = 0; attempt < 100; attempt++) {
      try { handle = await open(file, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600); break; }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        if (attempt === 99) throw new Error("Artifact store is busy; retry or clean a confirmed abandoned .retention.lock.");
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    try { return await action(); } finally { await handle!.close(); await rm(file); }
  }

  private async putUnlocked(kind: string, content: string | Uint8Array, retentionDays: number): Promise<{ digest: string; id: string }> {
    validateKind(kind);
    if (!Number.isInteger(retentionDays) || retentionDays <= 0) throw new ReviewFnError("REVIEWFN_ARTIFACT_UNSAFE", "retentionDays must be a positive integer.");
    await this.ensureSafeRoot();
    const bytes = Buffer.from(content);
    if (bytes.length > 32 * 1024 * 1024) throw new ReviewFnError("REVIEWFN_ARTIFACT_UNSAFE", "Artifact exceeds the 32 MiB read/write budget.");
    const digest = sha256(bytes);
    const id = `${kind}-${digest}`;
    const dataPath = path.join(this.root, `${id}.artifact`);
    const metadataPath = path.join(this.root, `${id}.json`);
    const createdAt = new Date();
    const metadata: ArtifactMetadata = { id, digest, kind, createdAt: createdAt.toISOString(), expiresAt: new Date(createdAt.getTime() + retentionDays * 86_400_000).toISOString() };
    await writeExclusiveOrVerify(dataPath, bytes, digest);
    await this.mergeMetadata(metadataPath, metadata);
    return { digest, id };
  }

  /** Import immutable data while merging its original expiration, not resetting it. */
  private async importUnlocked(sourceRoot: string): Promise<void> {
    await this.ensureSafeRoot();
    for (const entry of await readdir(sourceRoot)) {
      if (!entry.endsWith(".json")) continue;
      const metadata = JSON.parse((await safeRead(path.join(sourceRoot, entry))).toString("utf8")) as ArtifactMetadata;
      validateMetadata(metadata, entry);
      const bytes = await safeRead(path.join(sourceRoot, `${metadata.id}.artifact`));
      if (sha256(bytes) !== metadata.digest) throw new Error("Imported artifact digest mismatch.");
      await writeExclusiveOrVerify(path.join(this.root, `${metadata.id}.artifact`), bytes, metadata.digest);
      await this.mergeMetadata(path.join(this.root, entry), metadata);
    }
  }

  private async writeCopiesUnlocked(json: string, markdown: string, retentionDays: number): Promise<void> {
    if (!this.reportCopiesDirectory || !Number.isInteger(retentionDays) || retentionDays <= 0) throw new Error("Report-copy directory and positive retention are required.");
    await this.ensureSafeRoot();
    const metadata = { expiresAt: new Date(Date.now() + retentionDays * 86_400_000).toISOString(), digests: { "report.json": sha256(json), "report.md": sha256(markdown) } };
    await safeWrite(path.join(this.root, ".report-copies"), JSON.stringify(metadata));
    await safeWrite(path.join(this.reportCopiesDirectory, "report.json"), json);
    await safeWrite(path.join(this.reportCopiesDirectory, "report.md"), markdown);
  }

  private async mergeMetadata(file: string, metadata: ArtifactMetadata): Promise<void> {
    const existing = await safeRead(file).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? undefined : Promise.reject(error));
    if (existing) {
      const previous = JSON.parse(existing.toString("utf8")) as ArtifactMetadata;
      validateMetadata(previous, path.basename(file));
      if (Date.parse(previous.expiresAt) > Date.parse(metadata.expiresAt)) metadata = previous;
    }
    await safeWrite(file, JSON.stringify(metadata, null, 2));
  }

  public async get(id: string): Promise<Uint8Array | undefined> {
    if (!/^[a-z][a-z0-9-]{0,63}-[a-f0-9]{64}$/.test(id)) throw new ReviewFnError("REVIEWFN_ARTIFACT_UNSAFE", `Unsafe artifact id ${id}.`);
    return safeRead(path.join(this.root, `${id}.artifact`)).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? undefined : Promise.reject(error));
  }

  private async deleteExpiredUnlocked(now = new Date()): Promise<{ deleted: string[]; errors: string[] }> {
    await this.ensureSafeRoot();
    const deleted: string[] = [];
    const errors: string[] = [];
    for (const entry of await readdir(this.root)) {
      if (!entry.endsWith(".json")) continue;
      try {
        const metadata = JSON.parse((await safeRead(path.join(this.root, entry))).toString("utf8")) as ArtifactMetadata;
        validateMetadata(metadata, entry);
        if (Date.parse(metadata.expiresAt) > now.getTime()) continue;
        const artifactPath = path.join(this.root, `${metadata.id}.artifact`);
        if ((await lstat(artifactPath).catch(() => undefined))?.isSymbolicLink()) throw new Error("refusing symlinked artifact");
        await rm(artifactPath, { force: true });
        await rm(path.join(this.root, entry));
        deleted.push(metadata.id);
      } catch (error) {
        errors.push(`${entry}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (this.reportCopiesDirectory) {
      try {
        const raw = await safeRead(path.join(this.root, ".report-copies")).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? undefined : Promise.reject(error));
        if (raw) {
          const metadata = JSON.parse(raw.toString("utf8"));
          if (!Number.isFinite(Date.parse(metadata.expiresAt))) throw new Error("Invalid report-copy expiration.");
          if (Date.parse(metadata.expiresAt) <= now.getTime()) {
            for (const name of ["report.json", "report.md"]) {
              const file = path.join(this.reportCopiesDirectory, name);
              const content = await safeRead(file).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? undefined : Promise.reject(error));
              if (content && sha256(content) !== metadata.digests?.[name]) throw new Error("Report copy changed; refusing expiry deletion.");
              await rm(file, { force: true });
            }
            await rm(path.join(this.root, ".report-copies"));
          }
        }
      } catch (error) { errors.push(`Report copies: ${error instanceof Error ? error.message : String(error)}`); }
    }
    return { deleted, errors };
  }

  private async ensureSafeRoot(): Promise<void> {
    await safeDirectory(this.root);
    const stat = await lstat(this.root);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new ReviewFnError("REVIEWFN_ARTIFACT_UNSAFE", "Artifact root must be a real directory.");
  }
}

async function writeExclusiveOrVerify(file: string, bytes: Uint8Array, digest: string): Promise<void> {
  try {
    const handle = await open(file, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0), 0o600);
    try { await handle.writeFile(bytes); } finally { await handle.close(); }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const existing = await safeRead(file);
    if (sha256(existing) !== digest) throw new ReviewFnError("REVIEWFN_ARTIFACT_UNSAFE", "Existing content-addressed artifact has unexpected bytes.");
  }
}

function validateMetadata(metadata: ArtifactMetadata, entry: string): void {
  if (!/^[a-z][a-z0-9-]{0,63}-[a-f0-9]{64}$/.test(metadata.id) || entry !== `${metadata.id}.json` || metadata.id !== `${metadata.kind}-${metadata.digest}` || !Number.isFinite(Date.parse(metadata.expiresAt))) throw new Error("Invalid artifact metadata identity or expiry.");
}
