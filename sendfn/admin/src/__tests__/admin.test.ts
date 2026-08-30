import { afterEach, describe, expect, it, vi } from "vitest";
import { memoryAdapter } from "@superfunctions/db/adapters/memory";
import {
  MemoryAdminAuditSink,
  MemoryAdminIdempotencyStore,
  createAdminDispatcher,
  createAdminRegistry,
  type AdminOperationContext,
} from "@superfunctions/admin";
import { consoleSmsAdapter, sendfn, type PushProvider, type SendfnClient } from "sendfn";
import {
  createSendFnDomainAdminAdapter,
  sendFnAdminCapability,
  sendFnAdminResources,
} from "../index.js";

const clients: SendfnClient[] = [];

function domainClient(): SendfnClient {
  const client = sendfn({
    database: memoryAdapter({ debug: false }),
    smsProvider: consoleSmsAdapter(),
    options: { suppressionEnabled: true },
  });
  clients.push(client);
  return client;
}

function context(
  overrides: Partial<AdminOperationContext> = {},
): AdminOperationContext {
  return {
    scope: {
      installationId: "installation_1",
      workspaceId: "workspace_1",
      projectId: "project_1",
    },
    actor: { id: "operator_1", type: "user", permissions: ["*"] },
    requestId: `request_${crypto.randomUUID()}`,
    correlationId: "correlation_1",
    source: "console",
    ...overrides,
  };
}

function dispatcher(client = domainClient()) {
  const adapter = createSendFnDomainAdminAdapter({ sendfn: client, projectId: "project_1" });
  const audit = new MemoryAdminAuditSink();
  return {
    audit,
    client,
    dispatch: createAdminDispatcher({
      registry: createAdminRegistry({ adapters: [adapter], enabledModules: ["sendfn"] }),
      audit,
      idempotency: new MemoryAdminIdempotencyStore(),
      confirmation: { verify: ({ token }) => token === "confirmed" },
    }),
  };
}

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  vi.restoreAllMocks();
});

describe("@sendfn/admin", () => {
  it("declares only public SendFn domain resources with project minimum scope", () => {
    expect(sendFnAdminResources.map((resource) => resource.id)).toEqual([
      "templates",
      "messages",
      "deliveries",
      "suppressions",
      "device-tokens",
    ]);
    expect(sendFnAdminCapability.scopeLevels).toEqual([
      "installation",
      "workspace",
      "project",
      "environment",
    ]);
    expect(sendFnAdminCapability.operations).toHaveLength(19);
    expect(sendFnAdminCapability.operations.every((operation) => operation.minimumScope === "project")).toBe(true);
    expect(sendFnAdminCapability.operations.some((operation) => operation.id.includes("providers"))).toBe(false);
    expect(sendFnAdminCapability.operations.some((operation) => operation.id.includes("domains"))).toBe(false);
    expect(sendFnAdminCapability.operations.some((operation) => operation.id.includes("contacts"))).toBe(false);
    expect(sendFnAdminCapability.operations.some((operation) => operation.id.includes("webhooks"))).toBe(false);
    expect(sendFnAdminCapability.operations.some((operation) => operation.id.includes("usage"))).toBe(false);

    const bulkEmail = sendFnAdminCapability.operations.find(
      (operation) => operation.id === "sendfn.messages.send-email-bulk",
    );
    expect(bulkEmail?.safety).toMatchObject({
      idempotent: true,
      requiresConfirmation: true,
      confirmation: { method: "mfa", risk: "high" },
    });
    expect(bulkEmail?.inputSchema?.properties).toHaveProperty("messages");
    expect(bulkEmail?.inputSchema?.properties).not.toHaveProperty("payload");
    expect(sendFnAdminCapability.operations.find(
      (operation) => operation.id === "sendfn.device-tokens.list",
    )?.redaction?.outputFields).toContain("token");
    expect(sendFnAdminCapability.operations.find(
      (operation) => operation.id === "sendfn.messages.send-push",
    )?.redaction?.outputFields).toContain("deviceTokens");
    expect(sendFnAdminCapability.operations.find(
      (operation) => operation.id === "sendfn.device-tokens.deactivate",
    )?.redaction?.outputFields).toContain("deactivatedToken");
  });

  it("uses the real SendFn template, suppression, and device services", async () => {
    const { dispatch, audit } = dispatcher();

    const templates = await dispatch.dispatch<{ items: Array<{ id: string }> }>({
      operationId: "sendfn.templates.list",
      input: {},
      context: context({ confirmationToken: "confirmed" }),
    });
    expect(templates).toMatchObject({ ok: true });
    if (templates.ok) {
      expect(templates.data.items.map((item) => item.id)).toContain("welcome-email");
    }

    const registered = await dispatch.dispatch({
      operationId: "sendfn.templates.register",
      input: {
        template: {
          id: "admin-receipt",
          name: "Admin Receipt",
          subject: "Receipt {{number}}",
          html: "<p>{{number}}</p>",
          variables: ["number"],
        },
      },
      context: context({ idempotencyKey: "template_admin_receipt" }),
    });
    expect(registered).toMatchObject({ ok: true, data: { accepted: true } });

    const added = await dispatch.dispatch({
      operationId: "sendfn.suppressions.add",
      input: {
        email: "Suppressed@Example.com",
        reason: "manual",
        source: "operator",
      },
      context: context({
        idempotencyKey: "suppression_example",
        now: new Date("2026-08-13T10:00:00.000Z"),
      }),
    });
    expect(added).toMatchObject({
      ok: true,
      data: { accepted: true, email: "suppressed@example.com" },
    });

    const checked = await dispatch.dispatch({
      operationId: "sendfn.suppressions.get",
      input: { email: "SUPPRESSED@example.com" },
      context: context(),
    });
    expect(checked).toMatchObject({
      ok: true,
      data: { suppressed: true, item: { email: "suppressed@example.com" } },
    });

    const registeredDevice = await dispatch.dispatch({
      operationId: "sendfn.device-tokens.register",
      input: { userId: "user_1", token: "private-device-token", platform: "ios" },
      context: context({ idempotencyKey: "device_user_1_ios", confirmationToken: "confirmed" }),
    });
    expect(registeredDevice).toMatchObject({
      ok: true,
      data: { item: { userId: "user_1", token: "[REDACTED]", platform: "ios" } },
    });

    const devices = await dispatch.dispatch({
      operationId: "sendfn.device-tokens.list",
      input: { userId: "user_1", platform: "ios" },
      context: context({ confirmationToken: "confirmed" }),
    });
    expect(devices).toMatchObject({
      ok: true,
      data: { items: [{ userId: "user_1", token: "[REDACTED]", platform: "ios" }] },
    });
    expect(audit.events.some((event) => event.operationId === "sendfn.suppressions.add")).toBe(true);
    expect(audit.events.find((event) => event.operationId === "sendfn.suppressions.add")?.input).toMatchObject({
      email: "[REDACTED]",
    });
  });

  it("sends and persists a real SMS, then exposes its delivery event", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { dispatch } = dispatcher();
    const sent = await dispatch.dispatch<{ item: { id: string; status: string; provider: string } }>({
      operationId: "sendfn.messages.send-sms",
      input: { userId: "user_2", to: "+15555550100", message: "Hello from Super Console" },
      context: context({ confirmationToken: "confirmed" }),
    });
    expect(sent).toMatchObject({
      ok: true,
      data: { item: { status: "sent", provider: "console-sms" } },
    });
    if (!sent.ok) throw new Error("Expected the SendFn SMS operation to succeed.");

    const deliveries = await dispatch.dispatch({
      operationId: "sendfn.deliveries.list",
      input: { referenceId: sent.data.item.id, referenceType: "sms" },
      context: context(),
    });
    expect(deliveries).toMatchObject({
      ok: true,
      data: {
        items: [{ referenceId: sent.data.item.id, referenceType: "sms", eventType: "sent" }],
        nextCursor: null,
      },
    });
  });

  it("redacts provider tokens nested in push result metadata", async () => {
    const privateToken = "private-push-token";
    const pushProvider: PushProvider = {
      name: "test-push",
      platform: "android",
      capabilities: {
        maxPayloadSize: 4096,
        supportsBatching: true,
        supportsScheduling: false,
        supportsImages: true,
        supportsSilentPush: true,
      },
      async initialize() {},
      async close() {},
      async isHealthy() { return true; },
      validateToken() { return true; },
      async sendBulkPush() { return []; },
      async sendPush(request) {
        return {
          success: true,
          successCount: request.deviceTokens.length,
          failedCount: 0,
          invalidTokens: [],
          results: request.deviceTokens.map((token) => ({ token, success: true })),
          timestamp: new Date("2026-08-31T00:00:00.000Z"),
        };
      },
    };
    const client = sendfn({
      database: memoryAdapter({ debug: false }),
      pushProviders: { android: pushProvider },
    });
    clients.push(client);
    await client.registerDevice({ userId: "user_push", token: privateToken, platform: "android" });
    const { dispatch } = dispatcher(client);

    const sent = await dispatch.dispatch({
      operationId: "sendfn.messages.send-push",
      input: { userId: "user_push", title: "Hello", body: "World" },
      context: context({ confirmationToken: "confirmed" }),
    });

    expect(sent).toMatchObject({
      ok: true,
      data: {
        item: {
          deviceTokens: "[REDACTED]",
          metadata: { results: [{ token: "[REDACTED]", success: true }] },
        },
      },
    });
    expect(JSON.stringify(sent)).not.toContain(privateToken);
  });

  it("rejects access when a public SendFn client is mounted under another project", async () => {
    const { dispatch } = dispatcher();
    const result = await dispatch.dispatch({
      operationId: "sendfn.templates.list",
      input: {},
      context: context({
        scope: {
          installationId: "installation_1",
          workspaceId: "workspace_1",
          projectId: "project_2",
        },
      }),
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "forbidden", status: 403 },
    });
  });
});
