import { describe, expect, it, vi } from "vitest";
import {
  mailFnAdminCapability,
  createMailFnAdminAdapter,
  createMailFnAdminClient,
  createMailFnDomainAdminService,
  type MailFnAdminService,
} from "../index.js";
import {
  createAdminDispatcher,
  createAdminRegistry,
  MemoryAdminAuditSink,
  type AdminClient,
} from "@superfunctions/admin";
import {
  DEFAULT_PROJECT_QUOTA,
  DEFAULT_STABLE_RETENTION,
  MailFn,
  MailFnError,
  MemoryMailFnObjectStore,
  MemoryMailFnStore,
} from "@mailfn/core";

const context = {
  scope: {
    organizationId: "org_1",
    workspaceId: "workspace_1",
    projectId: "project_1",
    environmentId: "environment_1",
    namespace: "tenant_1",
    region: "in-south",
  },
  actor: { id: "operator_1", type: "user" as const, permissions: ["*"] },
  requestId: "request_1",
  correlationId: "correlation_1",
  source: "console" as const,
  idempotencyKey: "idempotency_1",
};

describe("@mailfn/admin", () => {
  it("declares the inventoried operator surface and mutation policy", () => {
    expect(mailFnAdminCapability.schemaVersion).toBe("1.0");
    expect(mailFnAdminCapability.availability).toBe("required-product");
    expect(mailFnAdminCapability.scopeLevels).toEqual([
      "organization",
      "workspace",
      "project",
      "environment",
    ]);
    expect(
      mailFnAdminCapability.operations.some(
        (operation) => operation.id === "mailfn.projects.list",
      ),
    ).toBe(true);
    const mutation = mailFnAdminCapability.operations.find(
      (operation) => operation.safety.classification !== "read",
    );
    expect(mutation).toMatchObject({
      safety: {
        audit: "required",
        idempotent: true,
      },
    });
    expect(mailFnAdminCapability.operations.find((operation) => operation.id === "mailfn.credentials.rotate-credential")?.safety).toMatchObject({
      idempotent: false,
      requiresConfirmation: true,
      confirmation: { risk: "critical", method: "mfa", maxAgeSeconds: 300 },
    });
    for (const operationId of [
      "mailfn.inboxes.expire-inbox",
      "mailfn.drafts.send-draft",
      "mailfn.domains-routes.manage-domain",
      "mailfn.webhooks.create-webhook",
      "mailfn.retention.purge",
    ]) {
      expect(mailFnAdminCapability.operations.find((operation) => operation.id === operationId)?.safety.confirmation).toBeDefined();
    }
  });

  it("reveals declared one-time webhook and credential secrets while redacting audit records", async () => {
    const service = {
      createWebhook: vi.fn(async () => ({
        ok: true as const,
        data: {
          accepted: true as const,
          item: {
            id: "webhook_1", projectId: "project_1", url: "https://example.test/hook",
            eventTypes: ["message.received"], status: "active", consecutiveFailures: 0,
            createdAt: "2026-08-30T00:00:00.000Z", updatedAt: "2026-08-30T00:00:00.000Z",
            secret: "one-time-secret",
          },
        },
      })),
      rotateCredential: vi.fn(async () => ({
        ok: true as const,
        data: {
          accepted: true as const,
          item: {
            id: "credential_2", projectId: "project_1", tokenPrefix: "mfn_credential_2",
            permissions: ["inbox:read"], status: "active", createdAt: "2026-08-30T00:00:00.000Z",
            token: "one-time-token",
          },
        },
      })),
    } as unknown as MailFnAdminService;
    const audit = new MemoryAdminAuditSink();
    const registry = createAdminRegistry({
      adapters: [createMailFnAdminAdapter(service)],
      enabledModules: ["mailfn"],
    });
    const dispatcher = createAdminDispatcher({
      registry,
      audit,
      confirmation: { verify: async () => true },
    });
    const confirmedContext = { ...context, confirmationToken: "confirmed" };
    await expect(dispatcher.dispatch({
      operationId: "mailfn.webhooks.create-webhook",
      input: { payload: { url: "https://example.test/hook", eventTypes: ["message.received"] } },
      context: confirmedContext,
    })).resolves.toMatchObject({ data: { item: { secret: "one-time-secret" } } });
    await expect(dispatcher.dispatch({
      operationId: "mailfn.credentials.rotate-credential",
      input: { id: "credential_1" },
      context: confirmedContext,
    })).resolves.toMatchObject({ data: { item: { token: "one-time-token" } } });
    expect(JSON.stringify(audit.events)).not.toContain("one-time-secret");
    expect(JSON.stringify(audit.events)).not.toContain("one-time-token");
  });

  it("delegates the operation and complete scope to the injected domain service", async () => {
    const listProjects = vi.fn(async (input, operationContext) => ({
      ok: true as const,
      data: {
        items: [{ limit: input.limit }],
        nextCursor: null,
        namespace: operationContext.scope.namespace,
        region: operationContext.scope.region,
      },
    }));
    const service = { listProjects } as unknown as MailFnAdminService;
    const adapter = createMailFnAdminAdapter(service);
    expect(Object.keys(adapter.handlers).sort()).toEqual(
      mailFnAdminCapability.operations.map((operation) => operation.id).sort(),
    );

    const result = await adapter.execute(
      "mailfn.projects.list",
      { limit: 25 },
      context,
    );

    expect(result.data).toEqual({
      items: [{ limit: 25 }],
      nextCursor: null,
      namespace: "tenant_1",
      region: "in-south",
    });
    expect(listProjects).toHaveBeenCalledWith({ limit: 25 }, context);
  });

  it("preserves the receiver for class-based administration services", async () => {
    class ReceiverService {
      readonly marker = "receiver-preserved";

      async listProjects() {
        return {
          ok: true as const,
          data: { items: [{ marker: this.marker }], nextCursor: null },
        };
      }
    }
    const adapter = createMailFnAdminAdapter(new ReceiverService() as unknown as MailFnAdminService);

    const result = await adapter.execute("mailfn.projects.list", {}, context);

    expect(result.data.items).toEqual([{ marker: "receiver-preserved" }]);
  });

  it("exposes named typed clients for mutations instead of generic operation dispatch", async () => {
    const invokeOperation = vi.fn(async () => ({ ok: true, data: { accepted: true } }));
    const client = createMailFnAdminClient({ invokeOperation } as unknown as AdminClient);

    await client.webhooks.create(
      { payload: { url: "https://example.test/hook", eventTypes: ["message.received"] } },
      { idempotencyKey: "idem_webhook" },
    );

    expect(invokeOperation).toHaveBeenCalledWith(
      "mailfn.webhooks.create-webhook",
      { payload: { url: "https://example.test/hook", eventTypes: ["message.received"] } },
      { idempotencyKey: "idem_webhook" },
    );
  });

  it("returns one-time secrets and delegates durable credential rotation idempotency", async () => {
    const rotateCredential = vi.fn(async () => ({
      credential: { id: "credential_new", projectId: "project_1", tokenHash: "hash", tokenPrefix: "mail", permissions: ["inbox:read"], status: "active", createdAt: "now" },
      token: "one-time-token",
    }));
    const options = {
      mailfn: {
        createWebhook: vi.fn(async () => ({ webhook: { id: "webhook_1", projectId: "project_1", secretHash: "hash", secretCiphertext: "ciphertext" }, secret: "one-time-secret" })),
        rotateCredential,
      } as unknown as MailFn,
      store: {
        getCredential: vi.fn(async () => ({ id: "credential_old", projectId: "project_1", permissions: ["inbox:read"], status: "active" })),
      } as unknown as MemoryMailFnStore,
    };
    const service = createMailFnDomainAdminService(options);
    const secondService = createMailFnDomainAdminService(options);
    await expect(service.createWebhook({ payload: { url: "https://example.test/hook", eventTypes: ["message.received"] } }, context)).resolves.toMatchObject({
      data: { item: { id: "webhook_1", secret: "one-time-secret" } },
    });
    const rotations = await Promise.all([
      service.rotateCredential({ id: "credential_old" }, context),
      secondService.rotateCredential({ id: "credential_old" }, context),
    ]);
    expect(rotations[0]).toMatchObject({ data: { item: { id: "credential_new", token: "one-time-token" } } });
    expect(rotations[1]).toEqual(rotations[0]);
    expect(rotateCredential).toHaveBeenCalledTimes(2);
    expect(rotateCredential).toHaveBeenCalledWith(expect.anything(), "credential_old", "idempotency_1");
  });

  it("binds project-scoped reads and writes to the real MailFn service", async () => {
    const store = new MemoryMailFnStore();
    await store.saveProject({
      id: "project_1",
      slug: "admin-project",
      displayName: "Admin project",
      status: "active",
      environment: "production",
      dataRegion: "in",
      defaultRetentionPolicy: { ...DEFAULT_STABLE_RETENTION },
      quota: { ...DEFAULT_PROJECT_QUOTA },
      createdAt: "2026-08-13T00:00:00.000Z",
      updatedAt: "2026-08-13T00:00:00.000Z",
    });
    const mailfn = new MailFn({
      store,
      objects: new MemoryMailFnObjectStore(),
      defaultDomain: "mail.example.test",
      ids: {
        generate: (() => {
          let sequence = 0;
          return (prefix: string) => `${prefix}_${++sequence}`;
        })(),
      },
    });
    const adapter = createMailFnAdminAdapter(
      createMailFnDomainAdminService({ mailfn, store }),
    );

    const created = await adapter.execute(
      "mailfn.inboxes.create-inbox",
      {
        payload: {
          kind: "stable",
          requestedLocalPart: "operators",
          displayName: "Operator inbox",
        },
      },
      context,
    );
    expect(created.data).toMatchObject({
      accepted: true,
      item: {
        projectId: "project_1",
        address: "operators@mail.example.test",
      },
    });

    const listed = await adapter.execute(
      "mailfn.inboxes.list",
      { limit: 25 },
      context,
    );
    expect(listed.data).toMatchObject({
      items: [{ address: "operators@mail.example.test" }],
      nextCursor: null,
    });
    expect(JSON.stringify(created.data)).not.toContain("token");
  });

  it("does not expose a MailFn object outside the active project", async () => {
    const store = new MemoryMailFnStore();
    await store.saveProject({
      id: "project_other",
      slug: "other",
      displayName: "Other",
      status: "active",
      environment: "production",
      dataRegion: "global",
      defaultRetentionPolicy: { ...DEFAULT_STABLE_RETENTION },
      quota: { ...DEFAULT_PROJECT_QUOTA },
      createdAt: "2026-08-13T00:00:00.000Z",
      updatedAt: "2026-08-13T00:00:00.000Z",
    });
    const adapter = createMailFnAdminAdapter(
      createMailFnDomainAdminService({
        mailfn: new MailFn({
          store,
          objects: new MemoryMailFnObjectStore(),
          defaultDomain: "mail.example.test",
        }),
        store,
      }),
    );

    await expect(
      adapter.execute("mailfn.projects.get", { id: "project_other" }, context),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("exhausts domain message pages before applying the declared admin search", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      id: `message_${index}`,
      subject: `Routine message ${index}`,
    }));
    const listMessages = vi.fn(async (_actor, input: { cursor?: string }) => (
      input.cursor
        ? { items: [{ id: "message_needle", subject: "Needle on the later page" }] }
        : { items: firstPage, nextCursor: "domain-page-2" }
    ));
    const service = createMailFnDomainAdminService({
      mailfn: {
        listInboxes: vi.fn(async () => [{ id: "inbox_1" }]),
        listMessages,
      } as unknown as MailFn,
      store: new MemoryMailFnStore(),
    });

    const result = await service.listMessages({ search: "needle", limit: 10 }, context);

    expect(result.data).toEqual({
      items: [{ id: "message_needle", subject: "Needle on the later page" }],
      nextCursor: null,
    });
    expect(listMessages).toHaveBeenCalledTimes(2);
    expect(listMessages.mock.calls[1]?.[1]).toMatchObject({ cursor: "domain-page-2", limit: 100 });
  });

  it("translates MailFn domain failures into canonical admin errors", async () => {
    const service = createMailFnDomainAdminService({
      mailfn: {
        getInbox: vi.fn(async () => {
          throw new MailFnError({
            code: "MAILFN_NOT_FOUND",
            message: "Inbox not found",
            status: 404,
          });
        }),
      } as unknown as MailFn,
      store: new MemoryMailFnStore(),
    });

    await expect(service.getInbox({ id: "missing" }, context)).rejects.toMatchObject({
      code: "not_found",
      status: 404,
      message: "Inbox not found",
    });
  });
});
