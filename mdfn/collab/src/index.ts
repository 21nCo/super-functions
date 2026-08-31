import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import { Transaction, validateMdfnSidecar, type EditorController, type MdfnJsonValue, type MdfnSidecar } from "@mdfn/core";

export interface CollaborationUser {
  readonly id: string;
  readonly name?: string;
  readonly color?: string;
  readonly metadata?: Readonly<Record<string, MdfnJsonValue>>;
}

export interface CollaborationSessionOptions {
  readonly controller: EditorController;
  readonly documentId: string;
  readonly user: CollaborationUser;
  readonly doc?: Y.Doc;
  readonly awareness?: Awareness;
  readonly authorizeUpdate?: (update: Uint8Array, origin: unknown) => boolean | Promise<boolean>;
  /** Protected editorial sidecar changes require an authoritative host decision. */
  readonly authorizeSidecarUpdate?: (previous: MdfnSidecar | undefined, next: MdfnSidecar | undefined, origin: unknown) => boolean | Promise<boolean>;
  readonly profileId?: string;
  readonly protocolVersion?: number;
  /** Maximum valid UTF-8 Markdown size; used to derive safe Yjs update limits. */
  readonly maxDocumentBytes?: number;
  readonly maxUpdateBytes?: number;
  readonly online?: boolean;
  readonly sendUpdate?: (update: Uint8Array) => void | Promise<void>;
  readonly compactionThresholdBytes?: number;
  readonly onAudit?: (event: CollaborationAuditEvent) => void;
}

export interface CollaborationAuditEvent {
  readonly type: "local-update" | "remote-update" | "remote-rejected" | "offline" | "online" | "flush" | "compact";
  readonly documentId: string;
  readonly userId: string;
  readonly byteLength?: number;
  readonly pending?: number;
  readonly error?: string;
}

function parseSidecar(value: string | undefined, markdownLength?: number): MdfnSidecar | undefined {
  if (value === undefined) return undefined;
  try {
    return validateMdfnSidecar(JSON.parse(value), { markdownLength });
  } catch (error) {
    throw new Error(`MDFN_COLLAB_SIDECAR_INVALID:${error instanceof Error ? error.message : String(error)}`);
  }
}

export interface CollaborationSession {
  readonly doc: Y.Doc;
  readonly awareness: Awareness;
  encodeUpdate(stateVector?: Uint8Array): Uint8Array;
  encodeStateVector(): Uint8Array;
  applyUpdate(update: Uint8Array, origin?: unknown): Promise<void>;
  setPresence(value: Readonly<Record<string, MdfnJsonValue>>): void;
  getPresence(): ReadonlyMap<number, unknown>;
  isOnline(): boolean;
  pendingUpdateCount(): number;
  setOnline(online: boolean): Promise<void>;
  flush(): Promise<void>;
  compact(): Uint8Array;
  destroy(): void;
}

function changedRange(previous: string, current: string): { from: number; to: number; inserted: string } {
  let from = 0;
  while (from < previous.length && from < current.length && previous[from] === current[from]) from += 1;
  let oldEnd = previous.length;
  let newEnd = current.length;
  while (oldEnd > from && newEnd > from && previous[oldEnd - 1] === current[newEnd - 1]) { oldEnd -= 1; newEnd -= 1; }
  return { from, to: oldEnd, inserted: current.slice(from, newEnd) };
}

export function createCollaborationSession(options: CollaborationSessionOptions): CollaborationSession {
  const doc = options.doc ?? new Y.Doc({ guid: options.documentId });
  const ownsAwareness = !options.awareness;
  const awareness = options.awareness ?? new Awareness(doc);
  const source = doc.getText("markdown");
  const sidecar = doc.getMap<string>("sidecar");
  const metadata = doc.getMap<string>("metadata");
  const sharedDocumentInitialized = options.doc !== undefined && (source.length > 0 || sidecar.size > 0 || metadata.size > 0);
  const localOrigin = Object.freeze({ session: options.user.id });
  let applyingRemote = false;
  let destroyed = false;
  let online = options.online ?? true;
  interface PendingUpdate { readonly id: number; readonly update: Uint8Array; }
  let nextPendingId = 0;
  let pendingUpdates: PendingUpdate[] = [];
  let inFlight: PendingUpdate | null = null;
  let flushing: Promise<void> | null = null;
  let remoteApplication: Promise<void> = Promise.resolve();
  let documentGeneration = 0;
  const maxDocumentBytes = options.maxDocumentBytes ?? 2 * 1024 * 1024;
  const maxUpdateBytes = options.maxUpdateBytes ?? maxDocumentBytes + Math.max(64 * 1024, Math.ceil(maxDocumentBytes / 16));

  const emitAudit = (event: Omit<CollaborationAuditEvent, "documentId" | "userId">): void => {
    options.onAudit?.({ ...event, documentId: options.documentId, userId: options.user.id });
  };

  const expectedSchema = options.controller.getState().schemaHash;
  const expectedDocumentId = options.documentId;
  const expectedProfile = options.profileId ?? "default";
  const expectedProtocol = String(options.protocolVersion ?? 1);
  const expectedExtensions = JSON.stringify(options.controller.extensions.extensions.map((extension) => ({ name: extension.name, version: extension.version })));
  const bindMetadata = (key: string, expected: string, code: string): void => {
    const current = metadata.get(key);
    if (current !== undefined && current !== expected) throw new Error(`${code}:${current}:${expected}`);
    if (current === undefined) metadata.set(key, expected);
  };
  bindMetadata("schemaHash", expectedSchema, "MDFN_COLLAB_SCHEMA_MISMATCH");
  bindMetadata("documentId", expectedDocumentId, "MDFN_COLLAB_DOCUMENT_MISMATCH");
  bindMetadata("profileId", expectedProfile, "MDFN_COLLAB_PROFILE_MISMATCH");
  bindMetadata("protocolVersion", expectedProtocol, "MDFN_COLLAB_PROTOCOL_MISMATCH");
  bindMetadata("extensions", expectedExtensions, "MDFN_COLLAB_EXTENSIONS_MISMATCH");

  const assertContract = (candidate: Y.Doc): void => {
    const candidateMetadata = candidate.getMap<string>("metadata");
    const schema = candidateMetadata.get("schemaHash");
    if (schema !== expectedSchema) throw new Error(`MDFN_COLLAB_SCHEMA_MISMATCH:${schema ?? "missing"}:${expectedSchema}`);
    if (candidateMetadata.get("documentId") !== expectedDocumentId) throw new Error("MDFN_COLLAB_DOCUMENT_MISMATCH");
    if (candidateMetadata.get("profileId") !== expectedProfile) throw new Error("MDFN_COLLAB_PROFILE_MISMATCH");
    if (candidateMetadata.get("protocolVersion") !== expectedProtocol) throw new Error("MDFN_COLLAB_PROTOCOL_MISMATCH");
    if (candidateMetadata.get("extensions") !== expectedExtensions) throw new Error("MDFN_COLLAB_EXTENSIONS_MISMATCH");
    const markdown = candidate.getText("markdown").toString();
    try {
      options.controller.validateMarkdown(markdown);
    } catch (error) {
      throw new Error(`MDFN_COLLAB_MARKDOWN_INVALID:${error instanceof Error ? error.message : String(error)}`);
    }
    parseSidecar(candidate.getMap<string>("sidecar").get("value"), markdown.length);
  };

  const canonicalJson = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonicalJson);
    if (value === null || typeof value !== "object") return value;
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, entry]) => [key, canonicalJson(entry)]),
    );
  };
  const protectedSidecar = (value: MdfnSidecar | undefined): string => JSON.stringify(canonicalJson({
    comments: value?.comments ?? [],
    suggestions: value?.suggestions ?? [],
    reviewState: value?.reviewState ?? "draft",
    audit: value?.audit ?? [],
  }));

  const validateUpdate = async (update: Uint8Array, origin: unknown): Promise<number> => {
    const baseline = documentGeneration;
    const candidate = new Y.Doc({ guid: expectedDocumentId });
    try {
      Y.applyUpdate(candidate, Y.encodeStateAsUpdate(doc), "validation:baseline");
      Y.applyUpdate(candidate, update, "validation:candidate");
      assertContract(candidate);
      const previousSidecar = parseSidecar(sidecar.get("value"), source.length);
      const candidateSidecar = parseSidecar(candidate.getMap<string>("sidecar").get("value"), candidate.getText("markdown").length);
      if (protectedSidecar(previousSidecar) !== protectedSidecar(candidateSidecar)) {
        if (!options.authorizeSidecarUpdate || !(await options.authorizeSidecarUpdate(previousSidecar, candidateSidecar, origin))) {
          throw new Error("MDFN_COLLAB_EDITORIAL_UPDATE_FORBIDDEN");
        }
      }
      return baseline;
    } finally {
      candidate.destroy();
    }
  };

  if (!sharedDocumentInitialized) {
    if (source.length === 0) source.insert(0, options.controller.getState().markdown);
    if (!sidecar.has("value") && options.controller.getState().sidecar) sidecar.set("value", JSON.stringify(options.controller.getState().sidecar));
  } else {
    assertContract(doc);
    const state = options.controller.getState();
    const sharedMarkdown = source.toString();
    const sharedSidecar = parseSidecar(sidecar.get("value"), sharedMarkdown.length);
    let initial = new Transaction().withSource("collab:initial").withMetadata({ addToHistory: false });
    if (sharedMarkdown !== state.markdown) initial = initial.replaceSource(0, state.markdown.length, sharedMarkdown);
    if (JSON.stringify(sharedSidecar) !== JSON.stringify(state.sidecar)) initial = initial.setSidecar(sharedSidecar);
    if (initial.operations.length > 0) options.controller.dispatch(initial);
  }

  awareness.setLocalState({ user: options.user, documentId: options.documentId });

  const trackDocumentGeneration = (): void => { documentGeneration += 1; };
  doc.on("afterTransaction", trackDocumentGeneration);

  const unsubscribe = options.controller.subscribe((change) => {
    if (applyingRemote || destroyed) return;
    doc.transact(() => {
      if (change.documentChanged) {
        const current = source.toString();
        const range = changedRange(current, change.current.markdown);
        if (range.to > range.from) source.delete(range.from, range.to - range.from);
        if (range.inserted) source.insert(range.from, range.inserted);
      }
      if (change.sidecarChanged) {
        if (change.current.sidecar) sidecar.set("value", JSON.stringify(change.current.sidecar));
        else sidecar.delete("value");
      }
    }, localOrigin);
  });

  const applySharedState = (transaction: Y.Transaction): void => {
    if (destroyed || transaction.origin === localOrigin) return;
    applyingRemote = true;
    try {
      const state = options.controller.getState();
      const nextSource = source.toString();
      let edit = new Transaction().withSource("collab:remote").withMetadata({ addToHistory: false });
      if (nextSource !== state.markdown) edit = edit.replaceSource(0, state.markdown.length, nextSource);
      assertContract(doc);
      const nextSidecar = parseSidecar(sidecar.get("value"), nextSource.length);
      if (JSON.stringify(nextSidecar) !== JSON.stringify(state.sidecar)) edit = edit.setSidecar(nextSidecar);
      if (edit.operations.length > 0) options.controller.dispatch(edit);
    } finally { applyingRemote = false; }
  };
  doc.on("afterTransaction", applySharedState);

  const compactPending = (): Uint8Array => {
    const update = Y.encodeStateAsUpdate(doc);
    const replacement = { id: ++nextPendingId, update };
    pendingUpdates = inFlight ? [inFlight, replacement] : [replacement];
    emitAudit({ type: "compact", byteLength: update.byteLength, pending: pendingUpdates.length });
    return update;
  };

  const flush = async (): Promise<void> => {
    if (destroyed) throw new Error("MDFN_COLLAB_DESTROYED");
    if (!online || !options.sendUpdate || pendingUpdates.length === 0) return;
    if (flushing) return flushing;
    flushing = (async () => {
      while (online && pendingUpdates.length > 0) {
        const entry = pendingUpdates[0];
        inFlight = entry;
        try {
          await options.sendUpdate!(entry.update);
          pendingUpdates = pendingUpdates.filter((candidate) => candidate !== entry);
          emitAudit({ type: "flush", byteLength: entry.update.byteLength, pending: pendingUpdates.length });
        } finally {
          if (inFlight === entry) inFlight = null;
        }
      }
    })().finally(() => { flushing = null; });
    return flushing;
  };

  const queueLocalUpdate = (update: Uint8Array, origin: unknown): void => {
    if (destroyed || origin !== localOrigin) return;
    pendingUpdates.push({ id: ++nextPendingId, update: update.slice() });
    emitAudit({ type: "local-update", byteLength: update.byteLength, pending: pendingUpdates.length });
    const threshold = options.compactionThresholdBytes ?? 2 * 1024 * 1024;
    if (pendingUpdates.reduce((total, entry) => total + entry.update.byteLength, 0) > threshold) compactPending();
    if (online) void flush().catch((error: unknown) => {
      online = false;
      emitAudit({ type: "offline", pending: pendingUpdates.length, error: error instanceof Error ? error.message : String(error) });
    });
  };
  doc.on("update", queueLocalUpdate);
  if (options.sendUpdate) {
    const initial = Y.encodeStateAsUpdate(doc);
    pendingUpdates.push({ id: ++nextPendingId, update: initial });
    emitAudit({ type: "local-update", byteLength: initial.byteLength, pending: pendingUpdates.length });
    if (online) void flush().catch((error: unknown) => {
      online = false;
      emitAudit({ type: "offline", pending: pendingUpdates.length, error: error instanceof Error ? error.message : String(error) });
    });
  }

  return {
    doc,
    awareness,
    encodeUpdate: (stateVector) => stateVector ? Y.encodeStateAsUpdate(doc, stateVector) : Y.encodeStateAsUpdate(doc),
    encodeStateVector: () => Y.encodeStateVector(doc),
    async applyUpdate(update, origin = "transport") {
      if (destroyed) throw new Error("MDFN_COLLAB_DESTROYED");
      const apply = async (): Promise<void> => {
        try {
          if (destroyed) throw new Error("MDFN_COLLAB_DESTROYED");
          if (update.byteLength > maxUpdateBytes) throw new RangeError(`MDFN_COLLAB_UPDATE_TOO_LARGE:${maxUpdateBytes}`);
          if (options.authorizeUpdate && !(await options.authorizeUpdate(update, origin))) throw new Error("MDFN_COLLAB_UPDATE_FORBIDDEN");
          for (;;) {
            const baseline = await validateUpdate(update, origin);
            if (baseline !== documentGeneration) continue;
            if (destroyed) throw new Error("MDFN_COLLAB_DESTROYED");
            Y.applyUpdate(doc, update, origin);
            emitAudit({ type: "remote-update", byteLength: update.byteLength });
            return;
          }
        } catch (error) {
          emitAudit({ type: "remote-rejected", byteLength: update.byteLength, error: error instanceof Error ? error.message : String(error) });
          throw error;
        }
      };
      const queued = remoteApplication.then(apply, apply);
      remoteApplication = queued.catch(() => undefined);
      return queued;
    },
    setPresence(value) { if (destroyed) throw new Error("MDFN_COLLAB_DESTROYED"); awareness.setLocalStateField("presence", value); },
    getPresence: () => awareness.getStates(),
    isOnline: () => online,
    pendingUpdateCount: () => pendingUpdates.length,
    async setOnline(value) {
      if (destroyed) throw new Error("MDFN_COLLAB_DESTROYED");
      online = value;
      emitAudit({ type: value ? "online" : "offline", pending: pendingUpdates.length });
      if (value) await flush();
    },
    flush,
    compact: compactPending,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      unsubscribe();
      doc.off("afterTransaction", applySharedState);
      doc.off("afterTransaction", trackDocumentGeneration);
      doc.off("update", queueLocalUpdate);
      pendingUpdates = [];
      awareness.setLocalState(null);
      if (ownsAwareness) awareness.destroy();
    },
  };
}

export { Awareness, Y };
export const MDFN_COLLAB_VERSION = "0.1.0" as const;
