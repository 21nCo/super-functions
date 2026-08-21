import { describe, expect, it, vi } from "vitest";
import {
  createAdminClient,
  validateAdminCapabilityManifest,
  type AdminOperationContext,
} from "@superfunctions/admin";
import {
  botFnAdminCapability,
  createBotFnAdminAdapter,
  createBotFnAdminClient,
  createBotFnOperatorService,
  MemoryBotFnOperatorStore,
} from "../index.js";

function context(
  projectId: string,
  workspaceId = "workspace",
  environmentId?: string,
): AdminOperationContext {
  return {
    scope: { installationId: "installation", workspaceId, projectId, environmentId },
    actor: { id: "operator", permissions: ["*"] },
    requestId: crypto.randomUUID(),
    source: "console",
    idempotencyKey: crypto.randomUUID(),
  };
}

function legacyContext(projectId: string): AdminOperationContext {
  return { ...context(projectId), scope: { organizationId: "installation", workspaceId: "workspace", projectId } };
}

describe("@botfn/admin", () => {
  it("publishes a valid optional operator surface", () => {
    expect(validateAdminCapabilityManifest(botFnAdminCapability)).toEqual([]);
    expect(botFnAdminCapability.availability).toBe("optional-product");
    expect(botFnAdminCapability.operations).toHaveLength(8);
    expect(botFnAdminCapability.operations.every((operation) => operation.minimumScope === "project")).toBe(true);
  });

  it("persists verified bindings, redacts credentials, and isolates projects", async () => {
    const verifyChannel = vi.fn(async () => ({ accountLabel: "Support" }));
    const adapter = createBotFnAdminAdapter(createBotFnOperatorService({
      store: new MemoryBotFnOperatorStore(),
      verifyChannel,
    }));

    expect(Object.keys(adapter.handlers)).toHaveLength(8);
    await adapter.execute("botfn.bots.upsert", { id: "support", name: "Support Bot" }, context("project-a"));
    const connected = await adapter.execute<any>("botfn.channels.connect", {
      id: "discord-support",
      botId: "support",
      platform: "discord",
      externalId: "channel-1",
      credentialRef: "vault://botfn/discord-support",
    }, context("project-a"));

    expect(verifyChannel).toHaveBeenCalledWith(
      expect.objectContaining({ platform: "discord", credentialRef: "vault://botfn/discord-support" }),
      expect.objectContaining({ scope: expect.objectContaining({ projectId: "project-a" }) }),
    );
    expect(connected.data.item).toMatchObject({ credentialConfigured: true, externalId: "channel-1" });
    expect(JSON.stringify(connected)).not.toContain("vault://botfn/discord-support");

    const own = await adapter.execute<any>("botfn.channels.list", {}, context("project-a"));
    const other = await adapter.execute<any>("botfn.channels.list", {}, context("project-a", "other-workspace"));
    const otherEnvironment = await adapter.execute<any>(
      "botfn.channels.list",
      {},
      context("project-a", "workspace", "production"),
    );
    expect(own.data.items).toHaveLength(1);
    expect(other.data.items).toEqual([]);
    expect(otherEnvironment.data.items).toEqual([]);
    expect((await adapter.execute<any>("botfn.channels.list", {}, legacyContext("project-a"))).data.items).toHaveLength(1);

    await adapter.execute("botfn.bots.upsert", { id: "sales", name: "Sales Bot" }, context("project-a"));
    const firstPage = await adapter.execute<any>("botfn.bots.list", { limit: 1 }, context("project-a"));
    const secondPage = await adapter.execute<any>(
      "botfn.bots.list",
      { limit: 1, cursor: firstPage.data.nextCursor },
      context("project-a"),
    );
    expect(firstPage.data.items).toHaveLength(1);
    expect(firstPage.data.nextCursor).toBe("1");
    expect(secondPage.data.items).toHaveLength(1);
    expect(secondPage.data.nextCursor).toBeNull();
  });

  it("exposes named typed client methods and common capability methods", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      data: { items: [], nextCursor: null },
    }), { status: 200 }));
    const client = createBotFnAdminClient(createAdminClient({
      baseUrl: "https://example.test/admin",
      fetch: fetcher as typeof fetch,
    }));

    await client.bots.list();
    expect(String(fetcher.mock.calls[0]![0])).toContain("botfn.bots.list");
    expect(client.channels.connect).toEqual(expect.any(Function));
    expect(client.availability).toEqual(expect.any(Function));
  });
});
