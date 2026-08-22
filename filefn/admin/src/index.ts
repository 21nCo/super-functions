import {
  createAdminCapabilityAdapter as createKernelAdminCapabilityAdapter,
  createCapabilityAdminClient,
  defineAdminCapability,
  type AdminClient,
  type AdminClientRequestOptions,
  type AdminCapabilityAvailability,
  type AdminCapabilityAdapter,
  type AdminJsonSchema,
  type AdminObjectSchema,
  type AdminOperationContext,
  type AdminOperationDefinition,
  type AdminOperationRequest,
  type AdminOperationResult,
  type AdminRawResponse,
  type AdminResourcePresentation,
  type AdminResult,
} from "@superfunctions/admin";
import type { FileRecord, FileVersionRecord, FilePermissionRecord, FileArtifactRecord } from "@filefn/server";

export interface FileFnAdminResourceDefinition {
  id: "files" | "versions" | "upload-sessions" | "grants" | "share-links" | "policies" | "artifacts";
  label: string;
  description: string;
  icon: string;
  risk: "standard" | "sensitive";
  minimumScope: "project";
  idField: string;
  displayFields: readonly string[];
  searchableFields: readonly string[];
  filterableFields: readonly string[];
  sortableFields: readonly string[];
  sensitiveFields: readonly string[];
  presentation?: AdminResourcePresentation;
}

export const fileFnAdminResources = [
  { id: "files", label: "Files", description: "Files visible to the active FileFn principal.", icon: "filefn:files", risk: "standard", minimumScope: "project", idField: "fileId", displayFields: ["fileId", "name", "mimeType", "size", "updatedAt"], searchableFields: ["fileId", "name"], filterableFields: [], sortableFields: ["updatedAt"], sensitiveFields: [] },
  { id: "versions", label: "Versions", description: "Authorized versions of a FileFn file.", icon: "filefn:versions", risk: "standard", minimumScope: "project", idField: "versionId", displayFields: ["versionId", "mimeType", "size", "createdAt"], searchableFields: ["versionId"], filterableFields: ["fileId"], sortableFields: ["createdAt"], sensitiveFields: ["storageKey"], presentation: { standaloneList: false, listOperationId: "filefn.versions.list", query: { filters: [{ field: "fileId", inputPath: "fileId" }] }, parent: { resourceId: "files", bindings: [{ sourceField: "fileId", queryField: "fileId" }] } } },
  { id: "upload-sessions", label: "Upload Sessions", description: "Upload sessions owned by the active FileFn principal.", icon: "filefn:upload-sessions", risk: "sensitive", minimumScope: "project", idField: "uploadSessionId", displayFields: ["uploadSessionId", "fileId", "status", "expiresAt"], searchableFields: ["uploadSessionId"], filterableFields: [], sortableFields: [], sensitiveFields: ["uploadSessionToken", "token", "url", "headers"] },
  { id: "grants", label: "Grants", description: "Permission grants for a file managed by the active owner.", icon: "filefn:grants", risk: "sensitive", minimumScope: "project", idField: "permissionId", displayFields: ["permissionId", "fileId", "userId", "role", "tenantId", "expiresAt"], searchableFields: ["permissionId", "userId", "role", "tenantId"], filterableFields: ["fileId"], sortableFields: ["createdAt"], sensitiveFields: [], presentation: { standaloneList: false, listOperationId: "filefn.grants.list", query: { filters: [{ field: "fileId", inputPath: "fileId" }] }, parent: { resourceId: "files", bindings: [{ sourceField: "fileId", queryField: "fileId" }] } } },
  { id: "share-links", label: "Share Links", description: "Redacted share-link records for a file the active principal may share.", icon: "filefn:share-links", risk: "sensitive", minimumScope: "project", idField: "tokenHashPrefix", displayFields: ["tokenHashPrefix", "fileId", "expiresAt", "downloads", "revokedAt"], searchableFields: ["tokenHashPrefix"], filterableFields: ["fileId"], sortableFields: ["createdAt"], sensitiveFields: ["token", "tokenHash"], presentation: { standaloneList: false, listOperationId: "filefn.share-links.list", query: { filters: [{ field: "fileId", inputPath: "fileId" }] }, parent: { resourceId: "files", bindings: [{ sourceField: "fileId", queryField: "fileId" }] } } },
  { id: "policies", label: "Policies", description: "Configured FileFn upload and storage policies.", icon: "filefn:policies", risk: "standard", minimumScope: "project", idField: "name", displayFields: ["name", "visibility", "storageTarget", "lifecycle"], searchableFields: ["name"], filterableFields: ["visibility", "storageTarget", "lifecycle"], sortableFields: ["name"], sensitiveFields: ["storagePath"] },
  { id: "artifacts", label: "Artifacts", description: "Processing artifacts for files visible to the active principal.", icon: "filefn:artifacts", risk: "standard", minimumScope: "project", idField: "artifactId", displayFields: ["artifactId", "fileId", "versionId", "kind", "mimeType", "size"], searchableFields: ["artifactId", "kind"], filterableFields: ["fileId", "versionId", "kind"], sortableFields: ["createdAt"], sensitiveFields: ["storageKey", "url", "headers"], presentation: { standaloneList: false, listOperationId: "filefn.artifacts.list", query: { filters: [{ field: "fileId", inputPath: "fileId" }] }, parent: { resourceId: "files", bindings: [{ sourceField: "fileId", queryField: "fileId" }] } } },
] as const satisfies readonly FileFnAdminResourceDefinition[];

type JsonRecord = Record<string, unknown>;
export interface PageInput { cursor?: string; limit?: number }
export interface IdInput { id: string }
export interface FileChildListInput extends PageInput { fileId: string }
export interface FileChildInput { fileId: string; id: string }
export interface CreateUploadInput {
  policy: string;
  fileName: string;
  size: number;
  mimeType: string;
  fileId?: string;
  metadata?: JsonRecord;
}
export interface UploadSessionInput { id: string; uploadSessionToken?: string }
export interface CreateGrantAdminInput {
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
export interface RevokeGrantAdminInput { fileId: string; id: string }
export interface CreateShareAdminInput { fileId: string; versionId?: string; expiresAt?: string; requiresAuth?: boolean; maxDownloads?: number }
export interface RevokeShareAdminInput { fileId: string; token: string }
export interface FileDownloadInput { id: string; versionId?: string }
export interface ProcessFileInput { fileId: string; versionId?: string }

export interface FileFnAdminOperationInputMap {
  "filefn.files.list": PageInput;
  "filefn.files.get": IdInput;
  "filefn.files.download": FileDownloadInput;
  "filefn.files.delete-file": IdInput;
  "filefn.versions.list": FileChildListInput;
  "filefn.versions.get": FileChildInput;
  "filefn.upload-sessions.get": UploadSessionInput;
  "filefn.upload-sessions.create-upload": CreateUploadInput;
  "filefn.upload-sessions.complete-upload": UploadSessionInput;
  "filefn.upload-sessions.abort-upload": UploadSessionInput;
  "filefn.grants.list": FileChildListInput;
  "filefn.grants.create-grant": CreateGrantAdminInput;
  "filefn.grants.revoke-grant": RevokeGrantAdminInput;
  "filefn.share-links.list": FileChildListInput;
  "filefn.share-links.create-share": CreateShareAdminInput;
  "filefn.share-links.revoke-share": RevokeShareAdminInput;
  "filefn.policies.list": PageInput;
  "filefn.policies.get": IdInput;
  "filefn.artifacts.list": FileChildListInput;
  "filefn.artifacts.get": FileChildInput;
  "filefn.artifacts.download": FileChildInput;
  "filefn.artifacts.process-file": ProcessFileInput;
}
export type FileFnAdminOperationId = keyof FileFnAdminOperationInputMap;
export interface FileFnAdminPage<T> { items: T[]; nextCursor: string | null }
export interface FileFnAdminItem<T> { item: T }
export interface FileFnAdminAccepted<T = never> { accepted: true; item?: T }
export type FileFnAdminVersion = Omit<FileVersionRecord, "storageKey">;
export type FileFnAdminArtifact = Omit<FileArtifactRecord, "storageKey">;
export interface FileFnAdminDownloadDescriptor { url: string; headers?: Record<string, string> }
export interface FileFnAdminUploadStatus { uploadSessionId: string; fileId?: string; status: string; totalParts: number; recordedParts: number[]; uploadedParts: number[]; chunkSizeBytes: number; fileSize: number; expiresAt: string }
export interface FileFnAdminShare { tokenHashPrefix: string; fileId: string; versionId: string | null; expiresAt: string | null; requiresAuth: boolean; maxDownloads: number | null; downloads: number; createdAt: string; revokedAt: string | null }
export interface FileFnAdminPolicy { name: string; contentTypes?: string[]; maxSizeBytes?: number; visibility?: "public" | "private" | "shared"; storageTarget?: string; artifactStorageTarget?: string; lifecycle?: "durable" | "temporary"; renderProfile?: "default" | "nucleus"; customStoragePath: boolean }
export interface FileFnAdminOperationOutputMap {
  "filefn.files.list": FileFnAdminPage<FileRecord>;
  "filefn.files.get": FileFnAdminItem<FileRecord>;
  "filefn.files.download": FileFnAdminItem<FileFnAdminDownloadDescriptor>;
  "filefn.files.delete-file": FileFnAdminAccepted;
  "filefn.versions.list": FileFnAdminPage<FileFnAdminVersion>;
  "filefn.versions.get": FileFnAdminItem<FileFnAdminVersion>;
  "filefn.upload-sessions.get": FileFnAdminItem<FileFnAdminUploadStatus>;
  "filefn.upload-sessions.create-upload": FileFnAdminAccepted<{ uploadSessionId: string }>;
  "filefn.upload-sessions.complete-upload": FileFnAdminAccepted<{ fileId: string; versionId: string }>;
  "filefn.upload-sessions.abort-upload": FileFnAdminAccepted;
  "filefn.grants.list": FileFnAdminPage<FilePermissionRecord>;
  "filefn.grants.create-grant": FileFnAdminAccepted<FilePermissionRecord>;
  "filefn.grants.revoke-grant": FileFnAdminAccepted;
  "filefn.share-links.list": FileFnAdminPage<FileFnAdminShare>;
  "filefn.share-links.create-share": FileFnAdminAccepted<{ token: string; expiresAt: string | null }>;
  "filefn.share-links.revoke-share": FileFnAdminAccepted;
  "filefn.policies.list": FileFnAdminPage<FileFnAdminPolicy>;
  "filefn.policies.get": FileFnAdminItem<FileFnAdminPolicy>;
  "filefn.artifacts.list": FileFnAdminPage<FileFnAdminArtifact>;
  "filefn.artifacts.get": FileFnAdminItem<FileFnAdminArtifact>;
  "filefn.artifacts.download": FileFnAdminItem<FileFnAdminDownloadDescriptor>;
  "filefn.artifacts.process-file": FileFnAdminAccepted<{ enqueued: boolean; jobId?: string }>;
}

const entitySchema: AdminObjectSchema = { type: "object", additionalProperties: true };
const pageOutputSchema: AdminObjectSchema = { type: "object", properties: { items: { type: "array", items: entitySchema }, nextCursor: { type: ["string", "null"] } }, required: ["items", "nextCursor"], additionalProperties: false };
const itemOutputSchema: AdminObjectSchema = { type: "object", properties: { item: entitySchema }, required: ["item"], additionalProperties: false };
const acceptedOutputSchema: AdminObjectSchema = { type: "object", properties: { accepted: { type: "boolean" }, item: entitySchema }, required: ["accepted"], additionalProperties: false };
const createShareOutputSchema: AdminObjectSchema = {
  type: "object",
  properties: {
    accepted: { type: "boolean" },
    item: {
      type: "object",
      properties: {
        token: { type: "string", minLength: 1 },
        expiresAt: { type: ["string", "null"] },
      },
      required: ["token"],
      additionalProperties: false,
    },
  },
  required: ["accepted", "item"],
  additionalProperties: false,
};
const pageProperties = { cursor: { type: "string", minLength: 1 }, limit: { type: "integer", minimum: 1, maximum: 100, default: 50 } } as const;
const pageInputSchema: AdminObjectSchema = { type: "object", properties: pageProperties, additionalProperties: false };
const idInputSchema: AdminObjectSchema = { type: "object", properties: { id: { type: "string", minLength: 1 } }, required: ["id"], additionalProperties: false };
const fileChildListInputSchema: AdminObjectSchema = { type: "object", properties: { fileId: { type: "string", minLength: 1 }, ...pageProperties }, required: ["fileId"], additionalProperties: false };
const fileChildInputSchema: AdminObjectSchema = { type: "object", properties: { fileId: { type: "string", minLength: 1 }, id: { type: "string", minLength: 1 } }, required: ["fileId", "id"], additionalProperties: false };
const uploadSessionInputSchema: AdminObjectSchema = { type: "object", properties: { id: { type: "string", minLength: 1 }, uploadSessionToken: { type: "string", minLength: 1 } }, required: ["id"], additionalProperties: false };
const createUploadInputSchema: AdminObjectSchema = { type: "object", properties: { policy: { type: "string", minLength: 1 }, fileName: { type: "string", minLength: 1 }, size: { type: "integer", minimum: 0 }, mimeType: { type: "string", minLength: 1 }, fileId: { type: "string", minLength: 1 }, metadata: { type: "object", additionalProperties: true } }, required: ["policy", "fileName", "size", "mimeType"], additionalProperties: false };
const createGrantInputSchema: AdminObjectSchema = { type: "object", properties: { fileId: { type: "string", minLength: 1 }, userId: { type: "string", minLength: 1 }, role: { type: "string", minLength: 1 }, tenantId: { type: "string", minLength: 1 }, canRead: { type: "boolean" }, canWrite: { type: "boolean" }, canDelete: { type: "boolean" }, canShare: { type: "boolean" }, expiresAt: { type: "string", minLength: 1 } }, required: ["fileId"], additionalProperties: false };
const revokeGrantInputSchema: AdminObjectSchema = { type: "object", properties: { fileId: { type: "string", minLength: 1 }, id: { type: "string", minLength: 1 } }, required: ["fileId", "id"], additionalProperties: false };
const createShareInputSchema: AdminObjectSchema = { type: "object", properties: { fileId: { type: "string", minLength: 1 }, versionId: { type: "string", minLength: 1 }, expiresAt: { type: "string", minLength: 1 }, requiresAuth: { type: "boolean" }, maxDownloads: { type: "integer", minimum: 1 } }, required: ["fileId"], additionalProperties: false };
const revokeShareInputSchema: AdminObjectSchema = { type: "object", properties: { fileId: { type: "string", minLength: 1 }, token: { type: "string", minLength: 1 } }, required: ["fileId", "token"], additionalProperties: false };
const downloadInputSchema: AdminObjectSchema = { type: "object", properties: { id: { type: "string", minLength: 1 }, versionId: { type: "string", minLength: 1 } }, required: ["id"], additionalProperties: false };
const processInputSchema: AdminObjectSchema = { type: "object", properties: { fileId: { type: "string", minLength: 1 }, versionId: { type: "string", minLength: 1 } }, required: ["fileId"], additionalProperties: false };

export const fileFnAdminSchemas = { entity: entitySchema, pageInput: pageInputSchema, pageOutput: pageOutputSchema, itemOutput: itemOutputSchema, acceptedOutput: acceptedOutputSchema, fileChildListInput: fileChildListInputSchema, fileChildInput: fileChildInputSchema, uploadSessionInput: uploadSessionInputSchema, createUploadInput: createUploadInputSchema, createGrantInput: createGrantInputSchema, revokeGrantInput: revokeGrantInputSchema, createShareInput: createShareInputSchema, revokeShareInput: revokeShareInputSchema, downloadInput: downloadInputSchema, processInput: processInputSchema } as const satisfies Record<string, AdminJsonSchema>;

function readOperation(id: FileFnAdminOperationId, title: string, description: string, resource: string, inputSchema: AdminObjectSchema, outputSchema: AdminObjectSchema, route: string, collection: boolean, idInput = "id", pagination = false, sensitiveFields: readonly string[] = [], auditRequired = false): AdminOperationDefinition {
  return { id, title, description, inputSchema, outputSchema, route: { method: "GET", path: route }, permission: `filefn.${resource}.read`, minimumScope: "project", safety: { classification: "read", idempotent: true, requiresConfirmation: false, audit: sensitiveFields.length || auditRequired ? "required" : "optional" }, ...(pagination ? { pagination: { mode: "cursor", defaultLimit: 50, maxLimit: 100 } as const } : {}), mcp: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }, ...(sensitiveFields.length ? { redaction: { outputFields: sensitiveFields } } : {}), target: collection ? { resource, collection: true } : { resource, idInput } };
}
function mutationOperation(options: { id: FileFnAdminOperationId; title: string; description: string; resource: string; inputSchema: AdminObjectSchema; outputSchema?: AdminObjectSchema; route: string; destructive?: boolean; confirmation?: "explicit" | "recent-auth" | "mfa"; collection?: boolean; idInput?: string; inputFields?: readonly string[]; allowOutputPaths?: readonly string[]; idempotent?: boolean }): AdminOperationDefinition {
  const destructive = options.destructive ?? false;
  const confirmation = options.confirmation;
  const idempotent = options.idempotent ?? true;
  return { id: options.id, title: options.title, description: options.description, inputSchema: options.inputSchema, outputSchema: options.outputSchema ?? acceptedOutputSchema, route: { method: "POST", path: options.route }, permission: options.id, minimumScope: "project", safety: { classification: destructive ? "destructive" : "write", idempotent, requiresConfirmation: Boolean(confirmation), ...(confirmation ? { confirmation: { risk: destructive ? "critical" : "high", method: confirmation, reason: options.description } as const } : {}), audit: "required" }, mcp: { readOnlyHint: false, destructiveHint: destructive, idempotentHint: idempotent }, ...(options.inputFields || options.allowOutputPaths ? { redaction: { ...(options.inputFields ? { inputFields: options.inputFields } : {}), ...(options.allowOutputPaths ? { allowOutputPaths: options.allowOutputPaths } : {}) } } : {}), target: options.collection ? { resource: options.resource, collection: true } : { resource: options.resource, idInput: options.idInput ?? "id" } };
}

const operations: AdminOperationDefinition[] = [
  readOperation("filefn.files.list", "List files", "List files authorized for the active FileFn principal.", "files", pageInputSchema, pageOutputSchema, "/resources/files", true, "id", true),
  readOperation("filefn.files.get", "Get file", "Get one authorized FileFn file.", "files", idInputSchema, itemOutputSchema, "/resources/files/:id", false),
  readOperation("filefn.files.download", "Download file", "Create an authorized download descriptor.", "files", downloadInputSchema, itemOutputSchema, "/resources/files/:id/download", false, "id", false, [], true),
  mutationOperation({ id: "filefn.files.delete-file", title: "Delete file", description: "Permanently delete a file, its versions, artifacts, grants, and shares.", resource: "files", inputSchema: idInputSchema, route: "/resources/files/actions/delete-file", destructive: true, confirmation: "mfa" }),
  readOperation("filefn.versions.list", "List versions", "List authorized versions for one file.", "versions", fileChildListInputSchema, pageOutputSchema, "/resources/versions", true, "id", true, ["storageKey"]),
  readOperation("filefn.versions.get", "Get version", "Get one authorized version bound to its file.", "versions", fileChildInputSchema, itemOutputSchema, "/resources/versions/:id", false, "id", false, ["storageKey"]),
  readOperation("filefn.upload-sessions.get", "Get upload session", "Get an upload session owned by the active FileFn principal.", "upload-sessions", uploadSessionInputSchema, itemOutputSchema, "/resources/upload-sessions/:id", false, "id", false, ["uploadSessionToken", "token", "url", "headers"]),
  mutationOperation({ id: "filefn.upload-sessions.create-upload", title: "Create upload", description: "Create a policy-validated, quota-checked upload session.", resource: "upload-sessions", inputSchema: createUploadInputSchema, route: "/resources/upload-sessions/actions/create-upload", collection: true }),
  mutationOperation({ id: "filefn.upload-sessions.complete-upload", title: "Complete upload", description: "Complete an owned upload session after its parts are recorded.", resource: "upload-sessions", inputSchema: uploadSessionInputSchema, route: "/resources/upload-sessions/actions/complete-upload", inputFields: ["uploadSessionToken"] }),
  mutationOperation({ id: "filefn.upload-sessions.abort-upload", title: "Abort upload", description: "Abort an owned upload session and clean up temporary parts.", resource: "upload-sessions", inputSchema: uploadSessionInputSchema, route: "/resources/upload-sessions/actions/abort-upload", destructive: true, confirmation: "explicit", inputFields: ["uploadSessionToken"] }),
  readOperation("filefn.grants.list", "List grants", "List grants for a file owned by the active principal.", "grants", fileChildListInputSchema, pageOutputSchema, "/resources/grants", true, "id", true),
  mutationOperation({ id: "filefn.grants.create-grant", title: "Create grant", description: "Grant file permissions through FileFn authorization services.", resource: "grants", inputSchema: createGrantInputSchema, route: "/resources/grants/actions/create-grant", collection: true, confirmation: "recent-auth" }),
  mutationOperation({ id: "filefn.grants.revoke-grant", title: "Revoke grant", description: "Revoke a file permission grant.", resource: "grants", inputSchema: revokeGrantInputSchema, route: "/resources/grants/actions/revoke-grant", destructive: true, confirmation: "recent-auth" }),
  readOperation("filefn.share-links.list", "List share links", "List redacted share links for a shareable file.", "share-links", fileChildListInputSchema, pageOutputSchema, "/resources/share-links", true, "id", true, ["token", "tokenHash"]),
  mutationOperation({ id: "filefn.share-links.create-share", title: "Create share", description: "Create a FileFn share link; its plaintext token is returned once.", resource: "share-links", inputSchema: createShareInputSchema, outputSchema: createShareOutputSchema, route: "/resources/share-links/actions/create-share", collection: true, confirmation: "recent-auth", idempotent: false, allowOutputPaths: ["$.item.token"] }),
  mutationOperation({ id: "filefn.share-links.revoke-share", title: "Revoke share", description: "Revoke a share link using its original plaintext token.", resource: "files", inputSchema: revokeShareInputSchema, route: "/resources/share-links/actions/revoke-share", destructive: true, confirmation: "recent-auth", idInput: "fileId", inputFields: ["token"] }),
  readOperation("filefn.policies.list", "List policies", "List configured FileFn policies.", "policies", pageInputSchema, pageOutputSchema, "/resources/policies", true, "id", true, ["storagePath"]),
  readOperation("filefn.policies.get", "Get policy", "Get one configured FileFn policy.", "policies", idInputSchema, itemOutputSchema, "/resources/policies/:id", false, "id", false, ["storagePath"]),
  readOperation("filefn.artifacts.list", "List artifacts", "List processing artifacts for an authorized file.", "artifacts", fileChildListInputSchema, pageOutputSchema, "/resources/artifacts", true, "id", true, ["storageKey"]),
  readOperation("filefn.artifacts.get", "Get artifact", "Get one artifact bound to an authorized file.", "artifacts", fileChildInputSchema, itemOutputSchema, "/resources/artifacts/:id", false, "id", false, ["storageKey"]),
  readOperation("filefn.artifacts.download", "Download artifact", "Create an authorized artifact download descriptor.", "artifacts", fileChildInputSchema, itemOutputSchema, "/resources/artifacts/:id/download", false, "id", false, [], true),
  mutationOperation({ id: "filefn.artifacts.process-file", title: "Process file", description: "Run or enqueue configured processors for an authorized file version.", resource: "artifacts", inputSchema: processInputSchema, route: "/resources/artifacts/actions/process-file", collection: true }),
];

export const fileFnAdminCapability = defineAdminCapability({ schemaVersion: "1.0", id: "filefn", displayName: "FileFn", version: "1.1.0", description: "Function-owned FileFn administration backed by public domain services.", category: "infrastructure", availability: "required-product", scopeLevels: ["installation", "workspace", "project", "environment"], dependencies: [], resources: fileFnAdminResources, navigation: [{ id: "filefn", label: "FileFn", path: "/modules/filefn", icon: "filefn", description: "Operate FileFn in the active project.", order: 100 }], operations: operations as readonly (AdminOperationDefinition & { readonly id: FileFnAdminOperationId })[] });

export type FileFnAdminClientOperationMethods = { [K in FileFnAdminOperationId]: (input: FileFnAdminOperationInputMap[K], options?: AdminClientRequestOptions) => Promise<AdminOperationResult<FileFnAdminOperationOutputMap[K]>> };
interface FileFnAdminClientCore {
  readonly manifest: typeof fileFnAdminCapability;
  readonly operations: FileFnAdminClientOperationMethods;
  availability(options?: AdminClientRequestOptions): Promise<AdminCapabilityAvailability>;
  invoke<K extends FileFnAdminOperationId>(operationId: K, input: FileFnAdminOperationInputMap[K], options?: AdminClientRequestOptions): Promise<AdminOperationResult<FileFnAdminOperationOutputMap[K]>>;
  raw<K extends FileFnAdminOperationId>(operationId: K, input: FileFnAdminOperationInputMap[K], options?: AdminClientRequestOptions): Promise<AdminRawResponse<AdminResult<FileFnAdminOperationOutputMap[K]>>>;
  pages<K extends FileFnAdminOperationId>(operationId: K, input: FileFnAdminOperationInputMap[K], options?: AdminClientRequestOptions): AsyncGenerator<AdminOperationResult<FileFnAdminOperationOutputMap[K]>>;
}
export interface FileFnAdminClient extends FileFnAdminClientCore {
  readonly files: {
    list(input?: PageInput, options?: AdminClientRequestOptions): Promise<AdminOperationResult<FileFnAdminOperationOutputMap["filefn.files.list"]>>;
    get(input: IdInput, options?: AdminClientRequestOptions): Promise<AdminOperationResult<FileFnAdminOperationOutputMap["filefn.files.get"]>>;
    download(input: FileDownloadInput, options?: AdminClientRequestOptions): Promise<AdminOperationResult<FileFnAdminOperationOutputMap["filefn.files.download"]>>;
    delete(input: IdInput, options?: AdminClientRequestOptions): Promise<AdminOperationResult<FileFnAdminOperationOutputMap["filefn.files.delete-file"]>>;
  };
  readonly versions: {
    list(input: FileChildListInput, options?: AdminClientRequestOptions): Promise<AdminOperationResult<FileFnAdminOperationOutputMap["filefn.versions.list"]>>;
    get(input: FileChildInput, options?: AdminClientRequestOptions): Promise<AdminOperationResult<FileFnAdminOperationOutputMap["filefn.versions.get"]>>;
  };
  readonly uploadSessions: {
    get(input: UploadSessionInput, options?: AdminClientRequestOptions): Promise<AdminOperationResult<FileFnAdminOperationOutputMap["filefn.upload-sessions.get"]>>;
    create(input: CreateUploadInput, options?: AdminClientRequestOptions): Promise<AdminOperationResult<FileFnAdminOperationOutputMap["filefn.upload-sessions.create-upload"]>>;
    complete(input: UploadSessionInput, options?: AdminClientRequestOptions): Promise<AdminOperationResult<FileFnAdminOperationOutputMap["filefn.upload-sessions.complete-upload"]>>;
    abort(input: UploadSessionInput, options?: AdminClientRequestOptions): Promise<AdminOperationResult<FileFnAdminOperationOutputMap["filefn.upload-sessions.abort-upload"]>>;
  };
  readonly grants: {
    list(input: FileChildListInput, options?: AdminClientRequestOptions): Promise<AdminOperationResult<FileFnAdminOperationOutputMap["filefn.grants.list"]>>;
    create(input: CreateGrantAdminInput, options?: AdminClientRequestOptions): Promise<AdminOperationResult<FileFnAdminOperationOutputMap["filefn.grants.create-grant"]>>;
    revoke(input: RevokeGrantAdminInput, options?: AdminClientRequestOptions): Promise<AdminOperationResult<FileFnAdminOperationOutputMap["filefn.grants.revoke-grant"]>>;
  };
  readonly shareLinks: {
    list(input: FileChildListInput, options?: AdminClientRequestOptions): Promise<AdminOperationResult<FileFnAdminOperationOutputMap["filefn.share-links.list"]>>;
    create(input: CreateShareAdminInput, options?: AdminClientRequestOptions): Promise<AdminOperationResult<FileFnAdminOperationOutputMap["filefn.share-links.create-share"]>>;
    revoke(input: RevokeShareAdminInput, options?: AdminClientRequestOptions): Promise<AdminOperationResult<FileFnAdminOperationOutputMap["filefn.share-links.revoke-share"]>>;
  };
  readonly policies: {
    list(input?: PageInput, options?: AdminClientRequestOptions): Promise<AdminOperationResult<FileFnAdminOperationOutputMap["filefn.policies.list"]>>;
    get(input: IdInput, options?: AdminClientRequestOptions): Promise<AdminOperationResult<FileFnAdminOperationOutputMap["filefn.policies.get"]>>;
  };
  readonly artifacts: {
    list(input: FileChildListInput, options?: AdminClientRequestOptions): Promise<AdminOperationResult<FileFnAdminOperationOutputMap["filefn.artifacts.list"]>>;
    get(input: FileChildInput, options?: AdminClientRequestOptions): Promise<AdminOperationResult<FileFnAdminOperationOutputMap["filefn.artifacts.get"]>>;
    download(input: FileChildInput, options?: AdminClientRequestOptions): Promise<AdminOperationResult<FileFnAdminOperationOutputMap["filefn.artifacts.download"]>>;
    process(input: ProcessFileInput, options?: AdminClientRequestOptions): Promise<AdminOperationResult<FileFnAdminOperationOutputMap["filefn.artifacts.process-file"]>>;
  };
}
export function createFileFnAdminClient(adminClient: AdminClient): FileFnAdminClient {
  const client = createCapabilityAdminClient(fileFnAdminCapability, adminClient) as unknown as FileFnAdminClientCore;
  return Object.assign(client, {
    files: {
      list: (input: PageInput = {}, options?: AdminClientRequestOptions) => client.invoke("filefn.files.list", input, options),
      get: (input: IdInput, options?: AdminClientRequestOptions) => client.invoke("filefn.files.get", input, options),
      download: (input: FileDownloadInput, options?: AdminClientRequestOptions) => client.invoke("filefn.files.download", input, options),
      delete: (input: IdInput, options?: AdminClientRequestOptions) => client.invoke("filefn.files.delete-file", input, options),
    },
    versions: {
      list: (input: FileChildListInput, options?: AdminClientRequestOptions) => client.invoke("filefn.versions.list", input, options),
      get: (input: FileChildInput, options?: AdminClientRequestOptions) => client.invoke("filefn.versions.get", input, options),
    },
    uploadSessions: {
      get: (input: UploadSessionInput, options?: AdminClientRequestOptions) => client.invoke("filefn.upload-sessions.get", input, options),
      create: (input: CreateUploadInput, options?: AdminClientRequestOptions) => client.invoke("filefn.upload-sessions.create-upload", input, options),
      complete: (input: UploadSessionInput, options?: AdminClientRequestOptions) => client.invoke("filefn.upload-sessions.complete-upload", input, options),
      abort: (input: UploadSessionInput, options?: AdminClientRequestOptions) => client.invoke("filefn.upload-sessions.abort-upload", input, options),
    },
    grants: {
      list: (input: FileChildListInput, options?: AdminClientRequestOptions) => client.invoke("filefn.grants.list", input, options),
      create: (input: CreateGrantAdminInput, options?: AdminClientRequestOptions) => client.invoke("filefn.grants.create-grant", input, options),
      revoke: (input: RevokeGrantAdminInput, options?: AdminClientRequestOptions) => client.invoke("filefn.grants.revoke-grant", input, options),
    },
    shareLinks: {
      list: (input: FileChildListInput, options?: AdminClientRequestOptions) => client.invoke("filefn.share-links.list", input, options),
      create: (input: CreateShareAdminInput, options?: AdminClientRequestOptions) => client.invoke("filefn.share-links.create-share", input, options),
      revoke: (input: RevokeShareAdminInput, options?: AdminClientRequestOptions) => client.invoke("filefn.share-links.revoke-share", input, options),
    },
    policies: {
      list: (input: PageInput = {}, options?: AdminClientRequestOptions) => client.invoke("filefn.policies.list", input, options),
      get: (input: IdInput, options?: AdminClientRequestOptions) => client.invoke("filefn.policies.get", input, options),
    },
    artifacts: {
      list: (input: FileChildListInput, options?: AdminClientRequestOptions) => client.invoke("filefn.artifacts.list", input, options),
      get: (input: FileChildInput, options?: AdminClientRequestOptions) => client.invoke("filefn.artifacts.get", input, options),
      download: (input: FileChildInput, options?: AdminClientRequestOptions) => client.invoke("filefn.artifacts.download", input, options),
      process: (input: ProcessFileInput, options?: AdminClientRequestOptions) => client.invoke("filefn.artifacts.process-file", input, options),
    },
  });
}

export type FileFnAdminServiceMethod<K extends FileFnAdminOperationId> = (
  input: FileFnAdminOperationInputMap[K],
  context: AdminOperationContext,
) => Promise<AdminOperationResult<FileFnAdminOperationOutputMap[K]>>;

export interface FileFnAdminService {
  listFiles: FileFnAdminServiceMethod<"filefn.files.list">;
  getFile: FileFnAdminServiceMethod<"filefn.files.get">;
  downloadFile: FileFnAdminServiceMethod<"filefn.files.download">;
  deleteFile: FileFnAdminServiceMethod<"filefn.files.delete-file">;
  listVersions: FileFnAdminServiceMethod<"filefn.versions.list">;
  getVersion: FileFnAdminServiceMethod<"filefn.versions.get">;
  getUploadSession: FileFnAdminServiceMethod<"filefn.upload-sessions.get">;
  createUpload: FileFnAdminServiceMethod<"filefn.upload-sessions.create-upload">;
  completeUpload: FileFnAdminServiceMethod<"filefn.upload-sessions.complete-upload">;
  abortUpload: FileFnAdminServiceMethod<"filefn.upload-sessions.abort-upload">;
  listGrants: FileFnAdminServiceMethod<"filefn.grants.list">;
  createGrant: FileFnAdminServiceMethod<"filefn.grants.create-grant">;
  revokeGrant: FileFnAdminServiceMethod<"filefn.grants.revoke-grant">;
  listShareLinks: FileFnAdminServiceMethod<"filefn.share-links.list">;
  createShareLink: FileFnAdminServiceMethod<"filefn.share-links.create-share">;
  revokeShareLink: FileFnAdminServiceMethod<"filefn.share-links.revoke-share">;
  listPolicies: FileFnAdminServiceMethod<"filefn.policies.list">;
  getPolicy: FileFnAdminServiceMethod<"filefn.policies.get">;
  listArtifacts: FileFnAdminServiceMethod<"filefn.artifacts.list">;
  getArtifact: FileFnAdminServiceMethod<"filefn.artifacts.get">;
  downloadArtifact: FileFnAdminServiceMethod<"filefn.artifacts.download">;
  processFile: FileFnAdminServiceMethod<"filefn.artifacts.process-file">;
}

function bind<K extends FileFnAdminOperationId>(handler: FileFnAdminServiceMethod<K>) {
  return ({ input, context }: AdminOperationRequest) => handler(input as FileFnAdminOperationInputMap[K], context);
}

export function createFileFnAdminAdapter(service: FileFnAdminService): AdminCapabilityAdapter<typeof fileFnAdminCapability> {
  const handlers = {
    "filefn.files.list": bind(service.listFiles),
    "filefn.files.get": bind(service.getFile),
    "filefn.files.download": bind(service.downloadFile),
    "filefn.files.delete-file": bind(service.deleteFile),
    "filefn.versions.list": bind(service.listVersions),
    "filefn.versions.get": bind(service.getVersion),
    "filefn.upload-sessions.get": bind(service.getUploadSession),
    "filefn.upload-sessions.create-upload": bind(service.createUpload),
    "filefn.upload-sessions.complete-upload": bind(service.completeUpload),
    "filefn.upload-sessions.abort-upload": bind(service.abortUpload),
    "filefn.grants.list": bind(service.listGrants),
    "filefn.grants.create-grant": bind(service.createGrant),
    "filefn.grants.revoke-grant": bind(service.revokeGrant),
    "filefn.share-links.list": bind(service.listShareLinks),
    "filefn.share-links.create-share": bind(service.createShareLink),
    "filefn.share-links.revoke-share": bind(service.revokeShareLink),
    "filefn.policies.list": bind(service.listPolicies),
    "filefn.policies.get": bind(service.getPolicy),
    "filefn.artifacts.list": bind(service.listArtifacts),
    "filefn.artifacts.get": bind(service.getArtifact),
    "filefn.artifacts.download": bind(service.downloadArtifact),
    "filefn.artifacts.process-file": bind(service.processFile),
  };
  return createKernelAdminCapabilityAdapter({
    manifest: fileFnAdminCapability,
    handlers,
    compensators: {
      "filefn.share-links.create-share": async ({ input, result, context }) => {
        const shareInput = input as CreateShareAdminInput;
        const shareResult = result as AdminOperationResult<FileFnAdminOperationOutputMap["filefn.share-links.create-share"]>;
        const token = shareResult.data.item?.token;
        if (!token) throw new Error("The created FileFn share token is unavailable for compensation.");
        await service.revokeShareLink({ fileId: shareInput.fileId, token }, context);
      },
    },
  });
}
export { createFileFnDomainAdminService, type FileFnDomainAdminServiceOptions } from "./domain-service.js";
export const adminCapability = fileFnAdminCapability;
export const createAdminAdapter = createFileFnAdminAdapter;
