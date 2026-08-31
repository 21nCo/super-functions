import { formatMdfnAssetUrl, inspectMdfnUrl, type AssetMetadata, type ExtensionRenderNode, type MdfnJsonValue } from "@mdfn/core";
import type { FileFnClient, RenderDescriptor } from "@filefn/client";

export interface AssetContext {
  readonly documentId: string;
  readonly userId?: string;
  readonly tenantId?: string;
  readonly purpose?: "insert" | "render" | "download" | "manage";
  readonly metadata?: Readonly<Record<string, MdfnJsonValue>>;
}

export type AssetOperation = "select" | "upload" | "resolve" | "delete";

export interface AssetReference extends AssetMetadata {
  readonly provider: "filefn" | string;
  readonly documentId: string;
  readonly versionId?: string;
}

export interface ResolvedAsset {
  readonly reference: AssetReference;
  readonly state: "ready" | "processing" | "pending-local" | "unsupported";
  readonly url?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly embed: "image" | "audio" | "video" | "download" | "placeholder";
  readonly warnings?: readonly string[];
}

/** Host-facing asset contract. Durable references never contain delivery URLs. */
export interface MdfnAssetProvider {
  select?(context: AssetContext): Promise<AssetReference | null>;
  upload?(file: File | Blob, context: AssetContext): Promise<AssetReference>;
  resolve(reference: AssetReference, context: AssetContext): Promise<ResolvedAsset>;
  authorize?(operation: AssetOperation, reference: AssetReference | undefined, context: AssetContext): Promise<void>;
  delete?(reference: AssetReference, context: AssetContext): Promise<void>;
}

async function authorized(provider: MdfnAssetProvider, operation: AssetOperation, reference: AssetReference | undefined, context: AssetContext): Promise<void> {
  if (reference && reference.documentId !== context.documentId) throw new Error("MDFN_ASSET_DOCUMENT_MISMATCH");
  await provider.authorize?.(operation, reference, context);
}

export function createAssetGateway(provider: MdfnAssetProvider): Required<Pick<MdfnAssetProvider, "select" | "upload" | "resolve" | "delete">> {
  return {
    async select(context) {
      await authorized(provider, "select", undefined, context);
      const reference = await provider.select?.(context) ?? null;
      if (reference) await authorized(provider, "resolve", reference, context);
      return reference;
    },
    async upload(file, context) {
      await authorized(provider, "upload", undefined, context);
      if (!provider.upload) throw new Error("MDFN_ASSET_UPLOAD_UNAVAILABLE");
      const reference = await provider.upload(file, context);
      if (reference.documentId !== context.documentId) throw new Error("MDFN_ASSET_DOCUMENT_MISMATCH");
      return reference;
    },
    async resolve(reference, context) {
      await authorized(provider, "resolve", reference, context);
      const resolved = await provider.resolve(reference, context);
      if (resolved.reference.id !== reference.id || resolved.reference.documentId !== context.documentId) throw new Error("MDFN_ASSET_RESOLUTION_MISMATCH");
      const allowedSchemes = resolved.state === "pending-local" ? ["http", "https", "blob"] : ["http", "https"];
      if (resolved.url && !inspectMdfnUrl(resolved.url, { allowedSchemes, allowRelative: true }).safe) throw new Error("MDFN_ASSET_URL_FORBIDDEN");
      return resolved;
    },
    async delete(reference, context) {
      if (!provider.delete) throw new Error("MDFN_ASSET_DELETE_UNAVAILABLE");
      const manageContext: AssetContext = { ...context, purpose: "manage" };
      await authorized(provider, "delete", reference, manageContext);
      const resolved = await provider.resolve(reference, manageContext);
      if (resolved.reference.id !== reference.id || resolved.reference.documentId !== context.documentId) {
        throw new Error("MDFN_ASSET_DOCUMENT_MISMATCH");
      }
      await authorized(provider, "delete", resolved.reference, manageContext);
      await provider.delete(resolved.reference, manageContext);
    },
  };
}

function fileName(file: File | Blob): string {
  return typeof File !== "undefined" && file instanceof File ? file.name : "asset";
}

function fileFnResolved(reference: AssetReference, descriptor: RenderDescriptor): ResolvedAsset {
  const source = descriptor.source;
  const url = source.mode === "artifact" || source.mode === "original" ? source.url : undefined;
  const headers = source.mode === "artifact" || source.mode === "original" ? source.headers : undefined;
  const mediaType = descriptor.mimeType;
  const embed = source.mode === "placeholder" ? "placeholder"
    : descriptor.state === "ready" || descriptor.state === "pending-local"
    ? mediaType.startsWith("image/") ? "image"
      : mediaType.startsWith("audio/") ? "audio"
        : mediaType.startsWith("video/") ? "video"
          : "download"
    : "placeholder";
  return { reference: { ...reference, versionId: descriptor.versionId, mediaType, name: descriptor.name, byteSize: descriptor.size }, state: descriptor.state, url, headers, embed, warnings: descriptor.warnings };
}

export function createFileFnAssetProvider(input: {
  readonly client: FileFnClient;
  readonly uploadPolicy: string;
  /** Resolve the durable FileFn upload metadata written by this adapter. */
  readonly resolveDocumentId: (fileId: string) => Promise<string | undefined>;
  readonly select?: (context: AssetContext) => Promise<AssetReference | null>;
  readonly authorize?: MdfnAssetProvider["authorize"];
}): MdfnAssetProvider {
  return {
    select: input.select,
    authorize: input.authorize,
    async upload(file, context) {
      const handle = input.client.uploadFile({
        policy: input.uploadPolicy,
        file,
        fileName: fileName(file),
        metadata: { mdfnDocumentId: context.documentId },
      });
      const result = await handle.done();
      return {
        id: result.fileId,
        provider: "filefn",
        documentId: context.documentId,
        versionId: result.versionId,
        mediaType: file.type || "application/octet-stream",
        name: fileName(file),
        byteSize: file.size,
      };
    },
    async resolve(reference) {
      const documentId = await input.resolveDocumentId(reference.id);
      if (!documentId) throw new Error(`MDFN_ASSET_OWNERSHIP_MISSING:${reference.id}`);
      const descriptor = await input.client.resolveRenderable({ fileId: reference.id, versionId: reference.versionId, intent: "preview", preferLocal: true });
      return fileFnResolved({ ...reference, documentId }, descriptor);
    },
    async delete(reference) { await input.client.deleteFile(reference.id); },
  };
}

export function assetReferenceMarkdown(reference: AssetReference, alt = reference.name ?? "asset"): string {
  const label = alt.replaceAll("\\", "\\\\").replaceAll("]", "\\]");
  const url = formatMdfnAssetUrl({ provider: reference.provider, id: reference.id, documentId: reference.documentId, versionId: reference.versionId });
  return `![${label}](${url})`;
}

export interface MdfnAuthoringAssetResult {
  readonly markdown: string;
  rollback(cause: unknown): Promise<void>;
}

export type MdfnAuthoringAssetHandler = (files: readonly (File | Blob)[]) => Promise<MdfnAuthoringAssetResult | undefined>;

export interface MdfnAssetRollbackFailure {
  readonly reference: AssetReference;
  readonly error: unknown;
}

export class MdfnAssetRollbackError extends Error {
  public readonly code = "MDFN_ASSET_ROLLBACK_FAILED" as const;

  public constructor(
    public readonly uploadError: unknown,
    public readonly uploadedReferences: readonly AssetReference[],
    public readonly rollbackFailures: readonly MdfnAssetRollbackFailure[],
  ) {
    super("MDFN_ASSET_ROLLBACK_FAILED", { cause: uploadError });
    this.name = "MdfnAssetRollbackError";
  }
}

/** Adapt any authorized asset provider to the framework-neutral authoring callback. */
export function createAuthoringAssetHandler(input: {
  readonly provider: MdfnAssetProvider;
  readonly context: AssetContext;
  readonly separator?: string;
}): MdfnAuthoringAssetHandler {
  const gateway = createAssetGateway(input.provider);
  const rollback = async (references: readonly AssetReference[], cause: unknown): Promise<void> => {
    const outcomes = await Promise.allSettled(
      references.map((reference) => gateway.delete(reference, { ...input.context, purpose: "manage" })),
    );
    const failures = outcomes.flatMap((result, index): MdfnAssetRollbackFailure[] =>
      result.status === "rejected" ? [{ reference: references[index]!, error: result.reason }] : [],
    );
    if (failures.length > 0) throw new MdfnAssetRollbackError(cause, references, failures);
  };
  return async (files) => {
    if (files.length === 0) return undefined;
    if (!input.provider.delete) throw new Error("MDFN_ASSET_DELETE_UNAVAILABLE");
    const references: AssetReference[] = [];
    try {
      for (const file of files) references.push(await gateway.upload(file, { ...input.context, purpose: "insert" }));
      return {
        markdown: references.map((reference) => assetReferenceMarkdown(reference)).join(input.separator ?? "\n"),
        rollback: (cause) => rollback(references, cause),
      };
    } catch (error) {
      await rollback(references, error);
      throw error;
    }
  };
}

export function resolvedAssetRenderNode(asset: ResolvedAsset): ExtensionRenderNode {
  if (asset.state !== "ready" && asset.state !== "pending-local") {
    return { tag: "span", attrs: { "data-mdfn-asset-state": asset.state }, text: asset.reference.name ?? "Asset unavailable" };
  }
  if (asset.embed === "placeholder") return { tag: "span", attrs: { "data-mdfn-asset-state": asset.state }, text: asset.reference.name ?? "Asset pending" };
  if (!asset.url) throw new Error("MDFN_ASSET_DELIVERY_URL_MISSING");
  if (asset.headers && Object.keys(asset.headers).length > 0) throw new Error("MDFN_ASSET_EMBED_HEADERS_UNSUPPORTED");
  if (asset.embed === "image") return { tag: "img", attrs: { src: asset.url, alt: asset.reference.name ?? "", loading: "lazy" } };
  if (asset.embed === "audio") return { tag: "audio", attrs: { src: asset.url, controls: true } };
  if (asset.embed === "video") return { tag: "video", attrs: { src: asset.url, controls: true } };
  return { tag: "a", attrs: { href: asset.url, rel: "noreferrer noopener" }, text: asset.reference.name ?? "Download asset" };
}

// A deterministic store is retained as a test/example provider. Production
// integrations should use createFileFnAssetProvider or a durable host provider.
export interface AssetUpload {
  readonly id?: string;
  readonly documentId: string;
  readonly name: string;
  readonly mediaType: string;
  readonly bytes: Uint8Array;
}

export interface StoredAsset extends AssetMetadata {
  readonly documentId: string;
  readonly url: string;
  readonly createdAt: string;
}

export interface MdfnAssetStore {
  put(input: AssetUpload): Promise<StoredAsset>;
  get(id: string): Promise<StoredAsset | null>;
  read(id: string): Promise<Uint8Array | null>;
  list(documentId: string): Promise<readonly StoredAsset[]>;
  deleteById(id: string): Promise<boolean>;
}

export function createMemoryAssetProvider(options: {
  readonly baseUrl?: string;
  readonly createId?: () => string;
  readonly maxBytes?: number;
  readonly allowedMediaTypes?: readonly string[];
  readonly authorize?: MdfnAssetProvider["authorize"];
} = {}): MdfnAssetProvider & MdfnAssetStore {
  const assets = new Map<string, { metadata: StoredAsset; bytes: Uint8Array }>();
  const createId = options.createId ?? (() => crypto.randomUUID());
  const baseUrl = (options.baseUrl ?? "/api/mdfn/assets").replace(/\/$/, "");
  const put = async (input: AssetUpload): Promise<StoredAsset> => {
    if (!input.documentId || !input.name || !input.mediaType) throw new Error("MDFN_ASSET_METADATA_REQUIRED");
    if (input.bytes.byteLength > (options.maxBytes ?? 25 * 1024 * 1024)) throw new RangeError("MDFN_ASSET_TOO_LARGE");
    if (options.allowedMediaTypes && !options.allowedMediaTypes.includes(input.mediaType)) throw new Error("MDFN_ASSET_MEDIA_TYPE_FORBIDDEN");
    const id = input.id ?? createId();
    if (assets.has(id)) throw new Error(`MDFN_ASSET_EXISTS:${id}`);
    const metadata: StoredAsset = Object.freeze({ id, documentId: input.documentId, name: input.name, mediaType: input.mediaType, byteSize: input.bytes.byteLength, url: `${baseUrl}/${encodeURIComponent(id)}`, createdAt: new Date().toISOString() });
    assets.set(id, { metadata, bytes: input.bytes.slice() });
    return metadata;
  };
  return {
    authorize: options.authorize,
    put,
    async get(id) { return assets.get(id)?.metadata ?? null; },
    async read(id) { return assets.get(id)?.bytes.slice() ?? null; },
    async list(documentId) { return [...assets.values()].map((entry) => entry.metadata).filter((entry) => entry.documentId === documentId); },
    async deleteById(id) { return assets.delete(id); },
    async upload(file, context) {
      const metadata = await put({ documentId: context.documentId, name: fileName(file), mediaType: file.type || "application/octet-stream", bytes: new Uint8Array(await file.arrayBuffer()) });
      const { url: _deliveryUrl, createdAt: _createdAt, ...durable } = metadata;
      return { ...durable, provider: "memory" };
    },
    async resolve(reference) {
      const metadata = assets.get(reference.id)?.metadata;
      if (!metadata) throw new Error(`MDFN_ASSET_NOT_FOUND:${reference.id}`);
      return { reference: { ...metadata, provider: reference.provider }, state: "ready", url: metadata.url, embed: metadata.mediaType.startsWith("image/") ? "image" : "download" };
    },
    async delete(reference) { assets.delete(reference.id); },
  };
}

export const MDFN_FILEFN_VERSION = "0.1.0" as const;
