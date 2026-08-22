import { describe, expect, it, vi } from "vitest";
import {
  createAdminClient,
  createAdminDispatcher,
  createAdminRegistry,
  MemoryAdminAuditSink,
  validateAdminCapabilityManifest,
} from "@superfunctions/admin";
import type {
  FileFn,
  FileService,
  GrantsService,
  SharesService,
  ProcessingService,
  PolicyRegistry,
  UploadSessionService,
} from "@filefn/server";
import {
  createFileFnAdminAdapter,
  createFileFnAdminClient,
  createFileFnDomainAdminService,
  fileFnAdminCapability,
} from "../index.js";

const context = {
  scope: {
    installationId: "installation_1",
    workspaceId: "workspace_1",
    projectId: "project_1",
    environmentId: "environment_1",
    namespace: "tenant_1",
  },
  actor: { id: "operator_1", type: "user" as const, permissions: ["*"] },
  requestId: "request_1",
  correlationId: "correlation_1",
  source: "console" as const,
  idempotencyKey: "idempotency_1",
};

function domain(overrides: {
  fileFn?: Partial<FileFn>;
  files?: Partial<FileService>;
  grants?: Partial<GrantsService>;
  shares?: Partial<SharesService>;
  processing?: Partial<ProcessingService>;
  policies?: Partial<PolicyRegistry>;
} = {}) {
  const fileFn = {
    ...overrides.fileFn,
    services: {
      files: overrides.files as FileService,
      uploads: {} as UploadSessionService,
      grants: overrides.grants as GrantsService,
      shares: overrides.shares as SharesService,
      processing: overrides.processing as ProcessingService,
      policies: {
        get: () => undefined,
        list: () => [],
        register: () => undefined,
        define: () => undefined,
        ...overrides.policies,
      },
    },
  } as FileFn;
  return createFileFnDomainAdminService({
    fileFn,
    context: (admin) => ({
      principalId: admin.actor.id,
      tenantId: admin.scope.projectId,
    }),
  });
}

describe("@filefn/admin", () => {
  it("advertises only domain-backed resources and exact high-risk contracts", () => {
    expect(validateAdminCapabilityManifest(fileFnAdminCapability)).toEqual([]);
    expect(fileFnAdminCapability.scopeLevels).toEqual([
      "installation",
      "workspace",
      "project",
      "environment",
    ]);
    expect(fileFnAdminCapability.resources?.map((resource) => resource.id)).toEqual([
      "files",
      "versions",
      "upload-sessions",
      "grants",
      "share-links",
      "policies",
      "artifacts",
    ]);
    expect(fileFnAdminCapability.operations.some((operation) => operation.id.includes("storage-targets"))).toBe(false);
    expect(fileFnAdminCapability.operations.some((operation) => operation.id.includes("dedup-retention"))).toBe(false);
    expect(fileFnAdminCapability.operations.some((operation) => operation.id.includes("restore-file"))).toBe(false);

    const grant = fileFnAdminCapability.operations.find((operation) => operation.id === "filefn.grants.create-grant");
    expect(grant?.inputSchema).toMatchObject({
      required: ["fileId"],
      additionalProperties: false,
      properties: { fileId: { type: "string" }, canShare: { type: "boolean" } },
    });
    expect(grant?.inputSchema?.properties).not.toHaveProperty("payload");
    expect(grant?.minimumScope).toBe("project");
    expect(grant?.safety.confirmation?.method).toBe("recent-auth");

    const deletion = fileFnAdminCapability.operations.find((operation) => operation.id === "filefn.files.delete-file");
    expect(deletion?.safety).toMatchObject({
      classification: "destructive",
      requiresConfirmation: true,
      confirmation: { risk: "critical", method: "mfa" },
      audit: "required",
    });

    for (const resourceId of ["versions", "grants", "share-links", "artifacts"]) {
      expect(fileFnAdminCapability.resources?.find(
        (resource) => resource.id === resourceId,
      )?.presentation).toMatchObject({
        standaloneList: false,
        query: { filters: [{ field: "fileId", inputPath: "fileId" }] },
        parent: {
          resourceId: "files",
          bindings: [{ sourceField: "fileId", queryField: "fileId" }],
        },
      });
    }
    expect(fileFnAdminCapability.operations.find(
      (operation) => operation.id === "filefn.share-links.revoke-share",
    )?.target).toEqual({ resource: "files", idInput: "fileId" });
    expect(fileFnAdminCapability.operations.find(
      (operation) => operation.id === "filefn.share-links.create-share",
    )?.safety).toMatchObject({ idempotent: false, audit: "required" });
    for (const operationId of ["filefn.files.download", "filefn.artifacts.download"]) {
      expect(fileFnAdminCapability.operations.find(
        (operation) => operation.id === operationId,
      )).toMatchObject({ safety: { audit: "required" } });
      expect(fileFnAdminCapability.operations.find(
        (operation) => operation.id === operationId,
      )?.redaction?.outputFields).toBeUndefined();
    }

    expect(() => createAdminRegistry({
      adapters: [createFileFnAdminAdapter(domain())],
      enabledModules: ["filefn"],
    })).not.toThrow();
  });

  it("revokes a newly created share when its required terminal audit fails", async () => {
    const createShareLink = vi.fn(async () => ({ token: "one-time-share-token", expiresAt: null }));
    const revokeShareLink = vi.fn(async () => undefined);
    const service = domain({ shares: { createShareLink, revokeShareLink } });
    const registry = createAdminRegistry({
      adapters: [createFileFnAdminAdapter(service)],
      enabledModules: ["filefn"],
    });
    expect(registry.requireOperation("filefn.share-links.create-share").adapter.compensators)
      .toHaveProperty("filefn.share-links.create-share");
    const audit = {
      idempotentById: true as const,
      write: vi.fn(async (event: { outcome: string }) => {
        if (event.outcome === "succeeded") throw new Error("audit unavailable");
      }),
    };
    const dispatcher = createAdminDispatcher({
      registry,
      audit,
      confirmation: { verify: () => true },
    });

    const result = await dispatcher.dispatch({
      operationId: "filefn.share-links.create-share",
      input: { fileId: "file_1" },
      context: { ...context, confirmationToken: "recent-auth" },
    });

    expect(result).toMatchObject({ ok: false, error: { code: "dependency_unavailable" } });
    expect(createShareLink).toHaveBeenCalledTimes(1);
    expect(revokeShareLink).toHaveBeenCalledWith(
      "file_1",
      "one-time-share-token",
      { principalId: "operator_1", tenantId: "project_1", requestId: "request_1" },
    );
  });

  it("delegates listing to FileFn with the mapped principal, tenant, and request context", async () => {
    const listFiles = vi.fn(async (_input, domainContext) => ({
      files: [{ fileId: "file_1", name: "a.txt" }],
      nextCursor: "domain_cursor",
      context: domainContext,
    }));
    const service = domain({ fileFn: { listFiles } });
    const adapter = createFileFnAdminAdapter(service);
    expect(Object.keys(adapter.handlers).sort()).toEqual(
      fileFnAdminCapability.operations.map((operation) => operation.id).sort(),
    );
    expect(service).not.toHaveProperty("execute");
    const result = await adapter.execute("filefn.files.list", { limit: 25 }, context);

    expect(result.data).toEqual({
      items: [{ fileId: "file_1", name: "a.txt" }],
      nextCursor: "domain_cursor",
    });
    expect(result.page).toEqual({ nextCursor: "domain_cursor", hasMore: true });
    expect(listFiles).toHaveBeenCalledWith(
      { limit: 25 },
      { principalId: "operator_1", tenantId: "project_1", requestId: "request_1" },
    );
  });

  it("provides named typed client methods for every FileFn resource family", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      data: { items: [], nextCursor: null },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const client = createFileFnAdminClient(createAdminClient({
      baseUrl: "https://console.example.test/api/admin/v1",
      fetch: fetcher as typeof fetch,
    }));

    await client.files.list({ limit: 25 });
    const [url, request] = fetcher.mock.calls[0]!;
    expect(String(url)).toContain("/operations/filefn.files.list");
    expect(JSON.parse(String(request?.body))).toEqual({ limit: 25 });
    expect(client).toEqual(expect.objectContaining({
      files: expect.any(Object),
      versions: expect.any(Object),
      uploadSessions: expect.any(Object),
      grants: expect.any(Object),
      shareLinks: expect.any(Object),
      policies: expect.any(Object),
      artifacts: expect.any(Object),
    }));
    expect(client.shareLinks.create).toEqual(expect.any(Function));
    expect(client.artifacts.process).toEqual(expect.any(Function));
  });

  it("uses public grant authorization services rather than an admin persistence shortcut", async () => {
    const createGrant = vi.fn(async (input, domainContext) => ({
      permissionId: "permission_1",
      ...input,
      createdAt: "2026-08-13T00:00:00.000Z",
      context: domainContext,
    }));
    const service = domain({ grants: { createGrant } });
    const result = await createFileFnAdminAdapter(service).execute(
      "filefn.grants.create-grant",
      { fileId: "file_1", userId: "user_2", canRead: true },
      context,
    );

    expect(result.data).toMatchObject({ accepted: true, item: { permissionId: "permission_1", fileId: "file_1" } });
    expect(createGrant).toHaveBeenCalledWith(
      { fileId: "file_1", userId: "user_2", canRead: true },
      { principalId: "operator_1", tenantId: "project_1", requestId: "request_1" },
    );
  });

  it("removes storage keys from version results before they reach any transport", async () => {
    const getVersion = vi.fn(async () => ({
      fileId: "file_1",
      versionId: "version_1",
      storageKey: "tenant/private/object",
      mimeType: "text/plain",
      size: 4,
      checksumSha256Base64: null,
      createdAt: "2026-08-13T00:00:00.000Z",
    }));
    const service = domain({ files: { getVersion } });
    const result = await createFileFnAdminAdapter(service).execute(
      "filefn.versions.get",
      { fileId: "file_1", id: "version_1" },
      context,
    );

    expect(result.data).toMatchObject({ item: { fileId: "file_1", versionId: "version_1" } });
    expect((result.data as { item: object }).item).not.toHaveProperty("storageKey");
  });

  it("preserves header-free provider download receipts and rejects provider header contracts", async () => {
    const getDownloadUrl = vi.fn(async () => ({
      url: "https://storage.example.test/signed-object?signature=opaque",
    }));
    const registry = createAdminRegistry({
      adapters: [createFileFnAdminAdapter(domain({ files: { getDownloadUrl } }))],
      enabledModules: ["filefn"],
    });
    const result = await createAdminDispatcher({
      registry,
      audit: new MemoryAdminAuditSink(),
    }).dispatch({
      operationId: "filefn.files.download",
      input: { id: "file_1" },
      context,
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        item: {
          url: "https://storage.example.test/signed-object?signature=opaque",
        },
      },
    });

    const secretHeaderRegistry = createAdminRegistry({
      adapters: [createFileFnAdminAdapter(domain({ files: { getDownloadUrl: async () => ({
        url: "https://storage.example.test/object",
        headers: { authorization: "Bearer storage-token" },
      }) } }))],
      enabledModules: ["filefn"],
    });
    await expect(createAdminDispatcher({
      registry: secretHeaderRegistry,
      audit: new MemoryAdminAuditSink(),
    }).dispatch({
      operationId: "filefn.files.download",
      input: { id: "file_1" },
      context,
    })).resolves.toMatchObject({
      ok: false,
      error: {
        code: "dependency_unavailable",
        details: { unsupportedHeaders: ["authorization"] },
      },
    });

    const encryptionHeaderRegistry = createAdminRegistry({
      adapters: [createFileFnAdminAdapter(domain({ files: { getDownloadUrl: async () => ({
        url: "https://storage.example.test/object",
        headers: { "x-goog-encryption-key": "base64-customer-key" },
      }) } }))],
      enabledModules: ["filefn"],
    });
    await expect(createAdminDispatcher({
      registry: encryptionHeaderRegistry,
      audit: new MemoryAdminAuditSink(),
    }).dispatch({
      operationId: "filefn.files.download",
      input: { id: "file_1" },
      context,
    })).resolves.toMatchObject({
      ok: false,
      error: {
        code: "dependency_unavailable",
        details: { unsupportedHeaders: ["x-goog-encryption-key"] },
      },
    });
  });

  it("pushes bounded child pagination into FileFn and binds cursors to the parent file", async () => {
    const versions = Array.from({ length: 3 }, (_, index) => ({
      fileId: "file_1",
      versionId: `version_${index + 1}`,
      storageKey: `private/${index + 1}`,
      mimeType: "text/plain",
      size: index + 1,
      checksumSha256Base64: null,
      createdAt: `2026-08-15T00:00:0${index}.000Z`,
    }));
    const listVersions = vi.fn(async (_fileId, _domainContext, page) => ({
      versions: versions.slice(page?.offset ?? 0, (page?.offset ?? 0) + (page?.limit ?? versions.length)),
    }));
    const service = domain({ files: { listVersions } });

    const first = await service.listVersions({ fileId: "file_1", limit: 2 }, context);
    expect(first.data.items).toHaveLength(2);
    expect(first.data.nextCursor).toEqual(expect.any(String));
    expect(listVersions).toHaveBeenCalledWith(
      "file_1",
      expect.any(Object),
      { limit: 3, offset: 0 },
    );

    await expect(service.listVersions({ fileId: "file_2", limit: 2, cursor: first.data.nextCursor! }, context))
      .rejects.toMatchObject({ code: "invalid_argument" });
    const second = await service.listVersions({ fileId: "file_1", limit: 2, cursor: first.data.nextCursor! }, context);
    expect(second.data).toMatchObject({ items: [{ versionId: "version_3" }], nextCursor: null });
    expect(listVersions).toHaveBeenLastCalledWith(
      "file_1",
      expect.any(Object),
      { limit: 3, offset: 2 },
    );
  });
});
