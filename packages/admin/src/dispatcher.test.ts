import { describe, expect, it, vi } from "vitest";
import { createAdminCapabilityAdapter } from "./adapter.js";
import { AdminAuditNotPersistedError, MemoryAdminAuditSink } from "./audit.js";
import { createAdminDispatcher } from "./dispatcher.js";
import { AdminError } from "./errors.js";
import { adminInputFingerprint, MemoryAdminIdempotencyStore } from "./idempotency.js";
import { createAdminRegistry } from "./registry.js";
import { testAdapter, testManifest } from "./test-fixtures.js";
import type { AdminOperationContext } from "./types.js";

const context = (overrides: Partial<AdminOperationContext> = {}): AdminOperationContext => ({
  scope: {
    organizationId: "org_1",
    workspaceId: "ws_1",
    projectId: "project_1",
    environmentId: "env_1",
    namespace: "tenant_1",
    region: "in-south",
  },
  actor: { id: "user_1", permissions: ["examplefn.records.read"] },
  requestId: "req_1",
  correlationId: "corr_1",
  source: "rest",
  ...overrides,
});

describe("AdminDispatcher", () => {
  it("stores stable hashed idempotency fingerprints instead of raw input", async () => {
    const first = await adminInputFingerprint({ id: "1", apiToken: "raw-secret" });
    const equivalent = await adminInputFingerprint({ apiToken: "raw-secret", id: "1" });
    const different = await adminInputFingerprint({ id: "1", apiToken: "different" });

    expect(first).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first).not.toContain("raw-secret");
    expect(equivalent).toBe(first);
    expect(different).not.toBe(first);
  });

  it("validates input, permissions, and output without throwing unsafe domain errors", async () => {
    const manifest = testManifest();
    const handler = vi.fn(async () => ({
      ok: true as const,
      data: { items: [] },
      auditId: "untrusted-domain-audit",
      requestId: "untrusted-domain-request",
    }));
    const registry = createAdminRegistry({
      adapters: [createAdminCapabilityAdapter(manifest, { [manifest.operations[0]!.id]: handler })],
      enabledModules: [manifest.id],
    });
    const dispatcher = createAdminDispatcher({ registry });

    expect(await dispatcher.dispatch({ operationId: "examplefn.records.list", input: { limit: 20 }, context: context() })).toMatchObject({ ok: true, data: { items: [] }, requestId: "req_1" });
    expect(await dispatcher.dispatch({ operationId: "examplefn.records.list", input: {}, context: context() })).not.toHaveProperty("auditId");
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ input: { limit: 20 }, context: expect.objectContaining({ scope: expect.objectContaining({ environmentId: "env_1" }) }) }));

    expect(await dispatcher.dispatch({ operationId: "examplefn.records.list", input: { limit: 1000 }, context: context() })).toMatchObject({ ok: false, error: { code: "invalid_argument" } });
    expect(await dispatcher.dispatch({ operationId: "examplefn.records.list", input: {}, context: context({ actor: { id: "denied", permissions: [] } }) })).toMatchObject({ ok: false, error: { code: "forbidden" } });
  });

  it("never returns an audit receipt when the sink rejected the event", async () => {
    const manifest = testManifest("examplefn", {
      operations: [
        {
          ...testManifest().operations[0]!,
          safety: { classification: "read", idempotent: true, audit: "required" },
        },
      ],
    });
    const registry = createAdminRegistry({
      adapters: [createAdminCapabilityAdapter(manifest, {
        "examplefn.records.list": async () => ({ ok: true as const, data: { items: [] } }),
      })],
      enabledModules: ["examplefn"],
    });
    const audit = {
      idempotentById: true as const,
      write: vi.fn(async () => {
        throw new Error("sink unavailable");
      }),
    };

    const result = await createAdminDispatcher({
      registry,
      audit,
      createAuditId: () => "audit_unwritten",
    }).dispatch({
      operationId: "examplefn.records.list",
      input: {},
      context: context(),
    });

    expect(result).toMatchObject({ ok: false, error: { code: "dependency_unavailable" } });
    expect(result).not.toHaveProperty("auditId");
    expect(audit.write).toHaveBeenCalledTimes(1);
  });

  it("continues optional-audit reads without fabricating a receipt", async () => {
    const manifest = testManifest();
    const registry = createAdminRegistry({
      adapters: [createAdminCapabilityAdapter(manifest, {
        "examplefn.records.list": async () => ({ ok: true as const, data: { items: [] } }),
      })],
      enabledModules: ["examplefn"],
    });
    const result = await createAdminDispatcher({
      registry,
      audit: {
        idempotentById: true,
        write: async () => {
          throw new Error("optional sink unavailable");
        },
      },
    }).dispatch({
      operationId: "examplefn.records.list",
      input: {},
      context: context(),
    });

    expect(result).toMatchObject({ ok: true, data: { items: [] } });
    expect(result).not.toHaveProperty("auditId");
  });

  it("records a sanitized attempt before invoking a required-audit mutation", async () => {
    const base = testManifest().operations[0]!;
    const manifest = testManifest("examplefn", {
      operations: [
        {
          ...base,
          id: "examplefn.records.rotate",
          inputSchema: {
            type: "object",
            properties: {
              id: { type: "string" },
              apiToken: { type: "string" },
            },
            required: ["id", "apiToken"],
            additionalProperties: false,
          },
          route: { method: "POST", path: "/records/:id/rotate" },
          permission: "examplefn.records.rotate",
          safety: { classification: "write", idempotent: true, audit: "required" },
          target: { resource: "records", idInput: "id" },
          redaction: { inputFields: ["apiToken"] },
          mcp: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
        },
      ],
    });
    const handler = vi.fn(async () => ({ ok: true as const, data: { items: [] } }));
    const registry = createAdminRegistry({
      adapters: [createAdminCapabilityAdapter(manifest, {
        "examplefn.records.rotate": handler,
      })],
      enabledModules: ["examplefn"],
    });
    const attempted: Array<{ outcome: string; input: unknown }> = [];
    let auditAvailable = false;
    const audit = {
      idempotentById: true as const,
      write: vi.fn(async (event: { outcome: string; input: unknown }) => {
        attempted.push(event);
        if (event.outcome === "attempted" && !auditAvailable) throw new Error("sink unavailable");
      }),
    };
    const dispatcher = createAdminDispatcher({
      registry,
      audit,
      idempotency: new MemoryAdminIdempotencyStore(),
    });
    const dispatch = () => dispatcher.dispatch({
      operationId: "examplefn.records.rotate",
      input: { id: "record_1", apiToken: "raw-secret" },
      context: context({
        actor: { id: "user_1", permissions: ["examplefn.records.rotate"] },
        idempotencyKey: "attempted",
      }),
    });
    const result = await dispatch();

    expect(handler).not.toHaveBeenCalled();
    expect(attempted[0]).toMatchObject({
      outcome: "attempted",
      input: { id: "record_1", apiToken: "[REDACTED]" },
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "dependency_unavailable", retryable: true },
    });
    expect(audit.write).toHaveBeenCalledTimes(1);

    auditAvailable = true;
    await expect(dispatch()).resolves.toMatchObject({ ok: true, data: { items: [] } });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(attempted.map(({ outcome }) => outcome)).toEqual(["attempted", "attempted", "succeeded"]);
  });

  it("records attempted then failed when a domain mutation throws", async () => {
    const base = testManifest().operations[0]!;
    const manifest = testManifest("examplefn", {
      operations: [
        {
          ...base,
          id: "examplefn.records.rotate",
          route: { method: "POST", path: "/records/rotate" },
          permission: "examplefn.records.rotate",
          safety: { classification: "write", idempotent: true, audit: "required" },
          mcp: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
        },
      ],
    });
    const audit = new MemoryAdminAuditSink();
    const registry = createAdminRegistry({
      adapters: [createAdminCapabilityAdapter(manifest, {
        "examplefn.records.rotate": async () => {
          throw new AdminError("conflict", "Cannot rotate.");
        },
      })],
      enabledModules: ["examplefn"],
    });

    const result = await createAdminDispatcher({
      registry,
      audit,
      idempotency: new MemoryAdminIdempotencyStore(),
    }).dispatch({
      operationId: "examplefn.records.rotate",
      input: {},
      context: context({
        actor: { id: "user_1", permissions: ["examplefn.records.rotate"] },
        idempotencyKey: "domain-failure",
      }),
    });

    expect(result).toMatchObject({ ok: false, error: { code: "conflict" } });
    expect(audit.events.map((event) => event.outcome)).toEqual([
      "attempted",
      "failed",
    ]);
    expect(result.auditId).toBe(audit.events[1]?.id);
  });

  it("returns no receipt when a terminal mutation audit write fails", async () => {
    const base = testManifest().operations[0]!;
    const manifest = testManifest("examplefn", {
      operations: [
        {
          ...base,
          id: "examplefn.records.rotate",
          route: { method: "POST", path: "/records/rotate" },
          permission: "examplefn.records.rotate",
          safety: { classification: "write", idempotent: true, audit: "required" },
          mcp: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
        },
      ],
    });
    const handler = vi.fn(async () => ({ ok: true as const, data: { items: [] } }));
    let writes = 0;
    const persistedOutcomes: string[] = [];
    const persistedMetadata: Array<Readonly<Record<string, unknown>> | undefined> = [];
    let terminalUnavailable = true;
    const registry = createAdminRegistry({
      adapters: [createAdminCapabilityAdapter(manifest, {
        "examplefn.records.rotate": handler,
      })],
      enabledModules: ["examplefn"],
    });
    const dispatcher = createAdminDispatcher({
      registry,
      audit: {
        idempotentById: true,
        write: async (event) => {
          writes += 1;
          if (writes > 1 && terminalUnavailable) throw new Error("terminal sink unavailable");
          persistedOutcomes.push(event.outcome);
          persistedMetadata.push(event.metadata);
        },
      },
      policy: {
        authorize: () => ({
          allowed: true,
          metadata: { policy: "manual", apiToken: "raw-secret", nested: { authorization: "raw-header" } },
        }),
      },
      idempotency: new MemoryAdminIdempotencyStore(),
    });
    const dispatch = (requestId: string) => dispatcher.dispatch({
      operationId: "examplefn.records.rotate",
      input: {},
      context: context({
        requestId,
        actor: { id: "user_1", permissions: ["examplefn.records.rotate"] },
        idempotencyKey: "terminal-audit",
      }),
    });
    const result = await dispatch("req_first");

    expect(handler).toHaveBeenCalledTimes(1);
    expect(writes).toBe(2);
    expect(result).toMatchObject({
      ok: false,
      error: { code: "dependency_unavailable" },
    });
    expect(result).not.toHaveProperty("auditId");

    terminalUnavailable = false;
    const recovered = await dispatch("req_retry");
    expect(recovered).toMatchObject({
      ok: true,
      meta: { idempotencyReplay: true, recoveredTerminalAudit: true },
    });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(writes).toBe(3);
    for (const requestId of ["req_replay_1", "req_replay_2", "req_replay_3"]) {
      await expect(dispatch(requestId)).resolves.toMatchObject({
        ok: true,
        meta: { idempotencyReplay: true },
      });
    }
    expect(handler).toHaveBeenCalledTimes(1);
    expect(persistedOutcomes).toEqual(["attempted", "succeeded", "replayed", "replayed", "replayed"]);
    expect(persistedMetadata[1]).toEqual({
      policy: "manual",
      apiToken: "[REDACTED]",
      nested: { authorization: "[REDACTED]" },
    });
  });

  it("reconciles a compensated failure with its stable terminal audit ID", async () => {
    const base = testManifest().operations[0]!;
    const manifest = testManifest("examplefn", { operations: [{
      ...base,
      id: "examplefn.records.rotate-compensated",
      route: { method: "POST", path: "/records/actions/rotate-compensated" },
      permission: "examplefn.records.rotate-compensated",
      safety: { classification: "write", idempotent: true, audit: "required" },
      mcp: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    }] });
    const handler = vi.fn(async () => ({ ok: true as const, data: { items: [] } }));
    let compensationAttempts = 0;
    const compensate = vi.fn(async () => {
      if (compensationAttempts++ === 0) throw new Error("transient compensation failure");
    });
    const persistedEvents: Array<{ id: string; outcome: string; metadata?: Readonly<Record<string, unknown>> }> = [];
    let failedAuditAttempts = 0;
    let auditSequence = 0;
    const dispatcher = createAdminDispatcher({
      registry: createAdminRegistry({
        adapters: [createAdminCapabilityAdapter({
          manifest,
          handlers: { "examplefn.records.rotate-compensated": handler },
          compensators: { "examplefn.records.rotate-compensated": compensate },
        })],
        enabledModules: ["examplefn"],
      }),
      audit: {
        idempotentById: true,
        write: async (event) => {
          if (event.outcome === "succeeded") {
            throw new AdminAuditNotPersistedError("terminal event was not persisted");
          }
          if (event.outcome === "failed" && failedAuditAttempts++ === 0) {
            throw new Error("rollback audit acknowledgement unavailable");
          }
          persistedEvents.push({ id: event.id, outcome: event.outcome, metadata: event.metadata });
        },
      },
      policy: {
        authorize: () => ({
          allowed: true,
          metadata: { policy: "manual", accessToken: "raw-secret" },
        }),
      },
      idempotency: new MemoryAdminIdempotencyStore(),
      createAuditId: () => `audit_${++auditSequence}`,
    });
    const dispatch = (requestId: string) => dispatcher.dispatch({
      operationId: "examplefn.records.rotate-compensated",
      input: {},
      context: context({
        requestId,
        actor: { id: "user_1", permissions: ["examplefn.records.rotate-compensated"] },
        idempotencyKey: "compensated-audit",
      }),
    });

    await expect(dispatch("initial")).resolves.toMatchObject({
      ok: false,
      error: { details: { outcome: "domain_completed", compensationFailed: true } },
    });
    await expect(dispatch("retry")).resolves.toMatchObject({
      ok: false,
      error: { details: { outcome: "compensated", reconciliationRequired: true } },
      meta: { idempotencyReplay: true, compensationCompleted: true },
    });
    await expect(dispatch("retry_audit")).resolves.toMatchObject({
      ok: false,
      auditId: "audit_2",
      meta: { idempotencyReplay: true, recoveredTerminalAudit: true },
    });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(compensate).toHaveBeenCalledTimes(2);
    expect(persistedEvents).toEqual([
      { id: "audit_1", outcome: "attempted", metadata: { policy: "manual", accessToken: "[REDACTED]" } },
      { id: "audit_2", outcome: "failed", metadata: { policy: "manual", accessToken: "[REDACTED]", compensation: "succeeded" } },
    ]);
  });

  it.each([
    ["preparation", "before-write"],
    ["preparation", "after-write"],
    ["completion", "before-write"],
    ["completion", "after-write"],
  ] as const)(
    "durably fences compensated results across a lost %s acknowledgement (%s)",
    async (failureStage, failureMode) => {
      const base = testManifest().operations[0]!;
      const operationId = "examplefn.records.rotate-fenced-compensation";
      const manifest = testManifest("examplefn", { operations: [{
        ...base,
        id: operationId,
        route: { method: "POST", path: "/records/actions/rotate-fenced-compensation" },
        permission: operationId,
        safety: { classification: "write", idempotent: true, audit: "required" },
        mcp: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
      }] });
      const handler = vi.fn(async () => ({ ok: true as const, data: { items: [] } }));
      const compensate = vi.fn(async () => undefined);
      const backing = new MemoryAdminIdempotencyStore();
      let prepareCalls = 0;
      let completionTransitionCalls = 0;
      const idempotency = {
        begin: backing.begin.bind(backing),
        complete: async (...args: Parameters<typeof backing.complete>) => {
          if (failureStage === "completion" && args[1].compensation?.status === "completed") {
            completionTransitionCalls += 1;
            if (completionTransitionCalls === 1) {
              if (failureMode === "after-write") backing.complete(...args);
              throw new Error(`injected ${failureMode}`);
            }
          }
          backing.complete(...args);
        },
        finalizeAudit: backing.finalizeAudit.bind(backing),
        release: backing.release.bind(backing),
        claimCompensation: backing.claimCompensation.bind(backing),
        releaseCompensation: backing.releaseCompensation.bind(backing),
        prepareCompensation: async (...args: Parameters<typeof backing.prepareCompensation>) => {
          prepareCalls += 1;
          if (failureStage === "preparation" && prepareCalls === 1) {
            if (failureMode === "after-write") backing.prepareCompensation(...args);
            throw new Error(`injected ${failureMode}`);
          }
          backing.prepareCompensation(...args);
        },
      };
      const dispatcher = createAdminDispatcher({
        registry: createAdminRegistry({
          adapters: [createAdminCapabilityAdapter({
            manifest,
            handlers: { [operationId]: handler },
            compensators: { [operationId]: compensate },
          })],
          enabledModules: ["examplefn"],
        }),
        audit: {
          idempotentById: true,
          write: async (event) => {
            if (event.outcome === "succeeded") {
              throw new AdminAuditNotPersistedError("terminal event was not persisted");
            }
          },
        },
        idempotency,
      });
      const dispatch = (requestId: string) => dispatcher.dispatch({
        operationId,
        input: {},
        context: context({
          requestId,
          actor: { id: "user_1", permissions: [operationId] },
          idempotencyKey: `fenced-compensation-${failureStage}-${failureMode}`,
        }),
      });

      await expect(dispatch("first")).resolves.toMatchObject({
        ok: false,
        error: { code: "dependency_unavailable" },
      });
      await expect(dispatch("retry")).resolves.toMatchObject({
        ok: false,
        meta: { idempotencyReplay: true },
      });
      expect(prepareCalls).toBe(failureStage === "preparation" ? 2 : 1);
      expect(completionTransitionCalls).toBe(
        failureStage === "completion" ? (failureMode === "before-write" ? 2 : 1) : 0,
      );
      expect(handler).toHaveBeenCalledTimes(1);
      expect(compensate).toHaveBeenCalledTimes(
        failureStage === "completion" && failureMode === "before-write" ? 2 : 1,
      );
    },
  );

  it("rejects idempotency stores without atomic terminal-audit reconciliation at startup", () => {
    const backing = new MemoryAdminIdempotencyStore();
    expect(() => createAdminDispatcher({
      registry: createAdminRegistry({ adapters: [testAdapter()], enabledModules: ["examplefn"] }),
      idempotency: {
        begin: backing.begin.bind(backing),
        complete: backing.complete.bind(backing),
        release: backing.release.bind(backing),
      } as never,
    })).toThrow(/atomic terminal-audit reconciliation/);
  });

  it("rejects idempotency stores without atomic compensation preparation at startup", () => {
    const backing = new MemoryAdminIdempotencyStore();
    expect(() => createAdminDispatcher({
      registry: createAdminRegistry({ adapters: [testAdapter()], enabledModules: ["examplefn"] }),
      idempotency: {
        begin: backing.begin.bind(backing),
        complete: backing.complete.bind(backing),
        finalizeAudit: backing.finalizeAudit.bind(backing),
        release: backing.release.bind(backing),
      } as never,
    })).toThrow(/atomic compensation preparation/);
  });

  it("reuses one stable terminal audit ID when reconciliation acknowledgement is repeatedly lost", async () => {
    const base = testManifest().operations[0]!;
    const manifest = testManifest("examplefn", { operations: [{
      ...base,
      id: "examplefn.records.rotate-stable-audit",
      route: { method: "POST", path: "/records/actions/rotate-stable-audit" },
      permission: "examplefn.records.rotate-stable-audit",
      safety: { classification: "write", idempotent: true, audit: "required" },
      mcp: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    }] });
    const handler = vi.fn(async () => ({ ok: true as const, data: { items: [] } }));
    const backing = new MemoryAdminIdempotencyStore();
    let failReconciliation = true;
    const idempotency = {
      begin: backing.begin.bind(backing),
      complete: backing.complete.bind(backing),
      prepareCompensation: backing.prepareCompensation.bind(backing),
      claimCompensation: backing.claimCompensation.bind(backing),
      releaseCompensation: backing.releaseCompensation.bind(backing),
      release: backing.release.bind(backing),
      finalizeAudit: async (...args: Parameters<typeof backing.finalizeAudit>) => {
        if (failReconciliation) throw new Error("lost reconciliation acknowledgement");
        backing.finalizeAudit(...args);
      },
    };
    const logicalEvents = new Map<string, { outcome: string }>();
    const deliveredIds: string[] = [];
    const dispatcher = createAdminDispatcher({
      registry: createAdminRegistry({ adapters: [createAdminCapabilityAdapter(manifest, { "examplefn.records.rotate-stable-audit": handler })], enabledModules: ["examplefn"] }),
      idempotency,
      audit: {
        idempotentById: true,
        write: async (event) => {
          deliveredIds.push(event.id);
          if (!logicalEvents.has(event.id)) logicalEvents.set(event.id, { outcome: event.outcome });
        },
      },
    });
    const dispatch = (requestId: string) => dispatcher.dispatch({
      operationId: "examplefn.records.rotate-stable-audit",
      input: {},
      context: context({ requestId, actor: { id: "user_1", permissions: ["examplefn.records.rotate-stable-audit"] }, idempotencyKey: "stable-audit" }),
    });
    await expect(dispatch("first")).resolves.toMatchObject({ ok: true });
    for (const requestId of ["retry_1", "retry_2", "retry_3"]) {
      await expect(dispatch(requestId)).resolves.toMatchObject({ ok: false, error: { code: "internal" } });
    }
    failReconciliation = false;
    await expect(dispatch("retry_4")).resolves.toMatchObject({ ok: true, meta: { recoveredTerminalAudit: true } });
    expect(handler).toHaveBeenCalledTimes(1);
    const terminalDeliveries = deliveredIds.slice(1);
    expect(new Set(terminalDeliveries).size).toBe(1);
    expect(logicalEvents.size).toBe(2); // attempted + one logical terminal event
  });

  it("rejects audit sinks without durable idempotency-by-event-ID at startup", () => {
    expect(() => createAdminDispatcher({
      registry: createAdminRegistry({ adapters: [testAdapter()], enabledModules: ["examplefn"] }),
      audit: { write: () => undefined } as never,
    })).toThrow(/first-write-wins idempotency by event ID/);
  });

  it.each(["before-write", "after-write"] as const)(
    "recovers an ambiguous idempotency completion failure (%s) with the same key without re-running the domain",
    async (failureMode) => {
      const base = testManifest().operations[0]!;
      const manifest = testManifest("examplefn", {
        operations: [{
          ...base,
          id: "examplefn.records.rotate",
          route: { method: "POST", path: "/records/rotate" },
          permission: "examplefn.records.rotate",
          safety: { classification: "write", idempotent: true, audit: "required" },
          mcp: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
        }],
      });
      const handler = vi.fn(async () => ({ ok: true as const, data: { items: [] } }));
      const registry = createAdminRegistry({
        adapters: [createAdminCapabilityAdapter(manifest, { "examplefn.records.rotate": handler })],
        enabledModules: ["examplefn"],
      });
      const backing = new MemoryAdminIdempotencyStore();
      let fail = true;
      const idempotency = {
        begin: backing.begin.bind(backing),
        complete: async (...args: Parameters<typeof backing.complete>) => {
          if (fail) {
            fail = false;
            if (failureMode === "after-write") backing.complete(...args);
            throw new Error(`injected ${failureMode}`);
          }
          backing.complete(...args);
        },
        prepareCompensation: backing.prepareCompensation.bind(backing),
        claimCompensation: backing.claimCompensation.bind(backing),
        releaseCompensation: backing.releaseCompensation.bind(backing),
        finalizeAudit: backing.finalizeAudit.bind(backing),
        release: backing.release.bind(backing),
      };
      const dispatcher = createAdminDispatcher({
        registry,
        audit: new MemoryAdminAuditSink(),
        idempotency,
      });
      const dispatch = (requestId: string) => dispatcher.dispatch({
        operationId: "examplefn.records.rotate",
        input: {},
        context: context({
          requestId,
          actor: { id: "user_1", permissions: ["examplefn.records.rotate"] },
          idempotencyKey: `completion-${failureMode}`,
        }),
      });

      await expect(dispatch("first")).resolves.toMatchObject({
        ok: false,
        error: { code: "dependency_unavailable", retryable: true },
      });
      await expect(dispatch("retry")).resolves.toMatchObject({
        ok: true,
        meta: { idempotencyReplay: true },
      });
      expect(handler).toHaveBeenCalledTimes(1);
    },
  );

  it("enforces confirmation, required audit, idempotency replay, conflict, and redaction", async () => {
    const read = testManifest().operations[0]!;
    const manifest = testManifest("examplefn", {
      operations: [{
        ...read,
        id: "examplefn.records.delete",
        title: "Delete record",
        inputSchema: { type: "object", properties: { id: { type: "string" }, apiToken: { type: "string" }, webhookToken: { type: "string" } }, required: ["id", "apiToken"], additionalProperties: false },
        outputSchema: { type: "object", properties: { deleted: { type: "boolean" }, privateBody: { type: "string" }, statusCode: { type: "integer" }, sessionCount: { type: "integer" }, authorization: { type: "string" } }, required: ["deleted", "privateBody", "statusCode", "sessionCount", "authorization"], additionalProperties: false },
        route: { method: "DELETE", path: "/records/:id" },
        permission: "examplefn.records.delete",
        safety: { classification: "destructive", idempotent: true, requiresConfirmation: true, audit: "required" },
        target: { resource: "records", idInput: "id" },
        redaction: { inputFields: ["apiToken"], outputFields: ["privateBody"] },
        mcp: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
      }],
    });
    const handler = vi.fn(async () => ({ ok: true as const, data: { deleted: true, privateBody: "raw-private", statusCode: 204, sessionCount: 3, authorization: "domain-value" } }));
    const registry = createAdminRegistry({
      adapters: [createAdminCapabilityAdapter(manifest, { "examplefn.records.delete": handler })],
      enabledModules: ["examplefn"],
    });
    const noInfrastructure = createAdminDispatcher({ registry });
    const baseContext = context({
      actor: { id: "user_1", permissions: ["examplefn.records.delete"] },
      confirmationToken: "confirmed",
      idempotencyKey: "idem_1",
    });
    const infrastructureFailure = await noInfrastructure.dispatch({ operationId: "examplefn.records.delete", input: { id: "1", apiToken: "raw-secret" }, context: baseContext });
    expect(infrastructureFailure).toMatchObject({ ok: false, error: { code: "dependency_unavailable" } });
    expect(infrastructureFailure).not.toHaveProperty("auditId");

    const audit = new MemoryAdminAuditSink();
    const idempotency = new MemoryAdminIdempotencyStore();
    let auditSequence = 0;
    const dispatcher = createAdminDispatcher({ registry, audit, idempotency, confirmation: { verify: ({ token }) => token === "confirmed" }, createAuditId: () => `audit_${++auditSequence}` });
    expect(await dispatcher.dispatch({ operationId: "examplefn.records.delete", input: { id: "1", apiToken: "raw-secret" }, context: { ...baseContext, confirmationToken: undefined } })).toMatchObject({ ok: false, error: { code: "precondition_failed" } });
    const first = await dispatcher.dispatch({ operationId: "examplefn.records.delete", input: { id: "1", apiToken: "raw-secret", webhookToken: "implicit-secret" }, context: baseContext });
    const replay = await dispatcher.dispatch({ operationId: "examplefn.records.delete", input: { id: "1", apiToken: "raw-secret", webhookToken: "implicit-secret" }, context: { ...baseContext, requestId: "req_2" } });
    expect(first).toMatchObject({ ok: true, data: { deleted: true, privateBody: "[REDACTED]", statusCode: 204, sessionCount: 3, authorization: "[REDACTED]" }, auditId: "audit_3" });
    expect(replay).toMatchObject({ ok: true, data: { deleted: true, privateBody: "[REDACTED]", statusCode: 204, sessionCount: 3, authorization: "[REDACTED]" }, meta: { idempotencyReplay: true } });
    expect(handler).toHaveBeenCalledTimes(1); // missing required infrastructure fails before domain execution
    expect(audit.events.at(-1)?.input).toEqual({ id: "1", apiToken: "[REDACTED]", webhookToken: "[REDACTED]" });
    expect(audit.events.slice(-3).map((event) => event.outcome)).toEqual(["attempted", "succeeded", "replayed"]);
    expect(replay).toMatchObject({ auditId: "audit_4", meta: { originalAuditId: "audit_3" } });
    expect(await dispatcher.dispatch({ operationId: "examplefn.records.delete", input: { id: "2", apiToken: "different" }, context: baseContext })).toMatchObject({ ok: false, error: { code: "conflict" } });
  });

  it("canonicalizes the deprecated organization scope alias for idempotency", async () => {
    const read = testManifest().operations[0]!;
    const manifest = testManifest("examplefn", {
      operations: [{
        ...read,
        id: "examplefn.records.refresh",
        route: { method: "POST", path: "/records/actions/refresh" },
        permission: "examplefn.records.refresh",
        minimumScope: "installation",
        safety: { classification: "write", idempotent: true, audit: "required" },
        mcp: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
      }],
    });
    const handler = vi.fn(async () => ({ ok: true as const, data: { items: [] } }));
    const dispatcher = createAdminDispatcher({
      registry: createAdminRegistry({
        adapters: [createAdminCapabilityAdapter(manifest, { "examplefn.records.refresh": handler })],
        enabledModules: ["examplefn"],
      }),
      audit: new MemoryAdminAuditSink(),
      idempotency: new MemoryAdminIdempotencyStore(),
    });
    const base = {
      actor: { id: "user_1", permissions: ["examplefn.records.refresh"] },
      idempotencyKey: "canonical-scope",
    };

    await expect(dispatcher.dispatch({
      operationId: "examplefn.records.refresh",
      input: {},
      context: context({ ...base, scope: { organizationId: "tenant" } }),
    })).resolves.toMatchObject({ ok: true });
    await expect(dispatcher.dispatch({
      operationId: "examplefn.records.refresh",
      input: {},
      context: context({ ...base, requestId: "req_alias", scope: { installationId: "tenant" } }),
    })).resolves.toMatchObject({ ok: true, meta: { idempotencyReplay: true } });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("enforces the operation minimum scope and rejects broken hierarchy chains", async () => {
    const manifest = testManifest();
    const registry = createAdminRegistry({ adapters: [createAdminCapabilityAdapter(manifest, { "examplefn.records.list": async () => ({ ok: true as const, data: { items: [] } }) })], enabledModules: ["examplefn"] });
    const result = await createAdminDispatcher({ registry }).dispatch({ operationId: "examplefn.records.list", input: {}, context: { ...context(), scope: { ...context().scope, environmentId: "" } } });
    expect(result).toMatchObject({ ok: false, error: { code: "invalid_argument" } });

    const installationManifest = testManifest("examplefn", {
      scopeLevels: ["installation", "workspace", "project", "environment"],
      operations: [{ ...testManifest().operations[0]!, minimumScope: "installation" }],
    });
    const installationRegistry = createAdminRegistry({
      adapters: [createAdminCapabilityAdapter(installationManifest, {
        "examplefn.records.list": async () => ({ ok: true as const, data: { items: [] } }),
      })],
      enabledModules: ["examplefn"],
    });
    const installationDispatcher = createAdminDispatcher({ registry: installationRegistry });
    await expect(installationDispatcher.dispatch({
      operationId: "examplefn.records.list",
      input: {},
      context: context({ scope: { installationId: "install_1" } }),
    })).resolves.toMatchObject({ ok: true });
    await expect(installationDispatcher.dispatch({
      operationId: "examplefn.records.list",
      input: {},
      context: context({ scope: { installationId: "install_1", projectId: "project_without_workspace" } }),
    })).resolves.toMatchObject({ ok: false, error: { code: "invalid_argument" } });
  });

  it("always ANDs manifest permission with a custom contextual policy", async () => {
    const manifest = testManifest();
    const handler = vi.fn(async () => ({ ok: true as const, data: { items: [] } }));
    const registry = createAdminRegistry({
      adapters: [createAdminCapabilityAdapter(manifest, { "examplefn.records.list": handler })],
      enabledModules: ["examplefn"],
    });
    const dispatcher = createAdminDispatcher({ registry, policy: { authorize: () => ({ allowed: true }) } });

    await expect(dispatcher.dispatch({
      operationId: "examplefn.records.list",
      input: {},
      context: context({ actor: { id: "denied", permissions: [] } }),
    })).resolves.toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect(handler).not.toHaveBeenCalled();

    await expect(dispatcher.dispatch({
      operationId: "examplefn.records.list",
      input: {},
      context: context(),
    })).resolves.toMatchObject({ ok: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does not reserve or require idempotency storage for reads", async () => {
    const manifest = testManifest();
    const handler = vi.fn(async () => ({ ok: true as const, data: { items: [] } }));
    const registry = createAdminRegistry({ adapters: [createAdminCapabilityAdapter(manifest, { "examplefn.records.list": handler })], enabledModules: ["examplefn"] });
    await expect(createAdminDispatcher({ registry }).dispatch({
      operationId: "examplefn.records.list",
      input: {},
      context: context({ idempotencyKey: "ignored-on-read" }),
    })).resolves.toMatchObject({ ok: true, data: { items: [] } });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("passes one immutable post-validation snapshot to policy and domain hooks", async () => {
    const manifest = testManifest();
    const handler = vi.fn(async ({ input, context: operationContext }) => {
      expect(Object.isFrozen(input)).toBe(true);
      expect(Object.isFrozen(operationContext)).toBe(true);
      expect(Object.isFrozen(operationContext.scope)).toBe(true);
      return { ok: true as const, data: { items: [{ input, scope: operationContext.scope }] } };
    });
    const registry = createAdminRegistry({ adapters: [createAdminCapabilityAdapter(manifest, { "examplefn.records.list": handler })], enabledModules: ["examplefn"] });
    const dispatcher = createAdminDispatcher({
      registry,
      policy: {
        authorize: ({ input, context: operationContext }) => {
          expect(Reflect.set(input as object, "limit", 999)).toBe(false);
          expect(Reflect.set(operationContext.scope, "environmentId", "other")).toBe(false);
          return { allowed: true };
        },
      },
    });
    const result = await dispatcher.dispatch({ operationId: "examplefn.records.list", input: { limit: 20 }, context: context() });
    expect(result).toMatchObject({ ok: true, data: { items: [{ input: { limit: 20 }, scope: { environmentId: "env_1" } }] } });
  });

  it("redacts secret error details without masking legitimate code fields", async () => {
    const manifest = testManifest();
    const registry = createAdminRegistry({
      adapters: [createAdminCapabilityAdapter(manifest, {
        "examplefn.records.list": async () => {
          throw new AdminError("conflict", "Conflict.", {
            details: {
              apiToken: "raw",
              statusCode: 409,
              sessionCount: 2,
              sessionId: "session_secret",
              verificationCode: "123456",
            },
          });
        },
      })],
      enabledModules: ["examplefn"],
    });

    expect(
      await createAdminDispatcher({ registry }).dispatch({
        operationId: "examplefn.records.list",
        input: {},
        context: context(),
      }),
    ).toMatchObject({
      ok: false,
      error: {
        code: "conflict",
        details: {
          apiToken: "[REDACTED]",
          statusCode: 409,
          sessionCount: 2,
          sessionId: "[REDACTED]",
          verificationCode: "[REDACTED]",
        },
      },
    });
  });

  it("uses declared sensitive response fields recursively", async () => {
    const base = testManifest().operations[0]!;
    const manifest = testManifest("examplefn", {
      operations: [
        {
          ...base,
          safety: { ...base.safety, audit: "required" },
          redaction: { outputFields: ["apiKey"] },
        },
      ],
    });
    const registry = createAdminRegistry({
      adapters: [createAdminCapabilityAdapter(manifest, {
        "examplefn.records.list": async () => ({
          ok: true as const,
          data: {
            items: [{ id: "record_1", nested: { api_key: "raw", statusCode: 200 } }],
          },
          meta: { api_key: "raw-meta", statusCode: 200 },
        }),
      })],
      enabledModules: ["examplefn"],
    });

    expect(
      await createAdminDispatcher({
        registry,
        audit: new MemoryAdminAuditSink(),
      }).dispatch({
        operationId: "examplefn.records.list",
        input: {},
        context: context(),
      }),
    ).toMatchObject({
      ok: true,
      data: {
        items: [
          {
            nested: { api_key: "[REDACTED]", statusCode: 200 },
          },
        ],
      },
      meta: { api_key: "[REDACTED]", statusCode: 200 },
    });
  });

  it("reveals an explicitly declared one-time secret while keeping audit data redacted", async () => {
    const base = testManifest().operations[0]!;
    const manifest = testManifest("examplefn", { operations: [{
      ...base,
      id: "examplefn.records.issue-token",
      description: "Issue a one-time token.",
      outputSchema: { type: "object", properties: { token: { type: "string" } }, required: ["token"], additionalProperties: false },
      route: { method: "POST", path: "/records/actions/issue-token" },
      permission: "examplefn.records.issue-token",
      safety: { classification: "write", idempotent: false, requiresConfirmation: true, confirmation: { risk: "high", method: "recent-auth", reason: "Issue one token." }, audit: "required" },
      redaction: { allowOutputPaths: ["$.token"] },
      target: { resource: "records", collection: true },
      mcp: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    }] });
    const audit = new MemoryAdminAuditSink();
    const registry = createAdminRegistry({
      adapters: [createAdminCapabilityAdapter(manifest, { "examplefn.records.issue-token": async () => ({ ok: true as const, data: { token: "one-time-secret" } }) })],
      enabledModules: ["examplefn"],
    });
    const result = await createAdminDispatcher({
      registry,
      audit,
      confirmation: { verify: async () => true },
    }).dispatch({
      operationId: "examplefn.records.issue-token",
      input: {},
      context: context({ confirmationToken: "confirmed", actor: { id: "user_1", permissions: ["examplefn.records.issue-token"] } }),
    });
    expect(result).toMatchObject({ ok: true, data: { token: "one-time-secret" } });
    expect(JSON.stringify(audit.events)).not.toContain("one-time-secret");
  });

  it("never applies a one-time output exception to error details", async () => {
    const base = testManifest().operations[0]!;
    const manifest = testManifest("examplefn", { operations: [{
      ...base,
      id: "examplefn.records.issue-token-error",
      outputSchema: {
        type: "object",
        properties: { item: { type: "object", properties: { token: { type: "string" } }, required: ["token"], additionalProperties: false } },
        required: ["item"],
        additionalProperties: false,
      },
      route: { method: "POST", path: "/records/actions/issue-token-error" },
      permission: "examplefn.records.issue-token-error",
      safety: { classification: "write", idempotent: false, requiresConfirmation: true, confirmation: { risk: "critical", method: "mfa", reason: "Issue token." }, audit: "required" },
      redaction: { allowOutputPaths: ["$.item.token"] },
      target: { resource: "records", collection: true },
      mcp: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    }] });
    const audit = new MemoryAdminAuditSink();
    const registry = createAdminRegistry({
      adapters: [createAdminCapabilityAdapter(manifest, {
        "examplefn.records.issue-token-error": async () => {
          throw new AdminError("conflict", "Could not issue token.", { details: { item: { token: "error-secret" } } });
        },
      })],
      enabledModules: ["examplefn"],
    });
    const result = await createAdminDispatcher({ registry, audit, confirmation: { verify: () => true } }).dispatch({
      operationId: "examplefn.records.issue-token-error",
      input: {},
      context: context({ confirmationToken: "confirmed", actor: { id: "user_1", permissions: ["examplefn.records.issue-token-error"] } }),
    });
    expect(result).toMatchObject({ ok: false, error: { details: { item: { token: "[REDACTED]" } } } });
    expect(JSON.stringify({ result, events: audit.events })).not.toContain("error-secret");
  });

  it("allows one-time secrets only at schema-bound object and array paths", async () => {
    const base = testManifest().operations[0]!;
    const secretItemSchema = {
      type: "object" as const,
      properties: {
        token: { type: "string" },
        nested: { type: "object", properties: { token: { type: "string" } }, additionalProperties: false },
      },
      required: ["token"],
      additionalProperties: false,
    };
    const manifest = testManifest("examplefn", { operations: [{
      ...base,
      id: "examplefn.records.issue-token-set",
      description: "Issue schema-bound one-time tokens.",
      outputSchema: {
        type: "object",
        properties: {
          item: secretItemSchema,
          items: { type: "array", items: secretItemSchema },
          token: { type: "string" },
        },
        required: ["item", "items", "token"],
        additionalProperties: false,
      },
      route: { method: "POST", path: "/records/actions/issue-token-set" },
      permission: "examplefn.records.issue-token-set",
      safety: { classification: "write", idempotent: false, requiresConfirmation: true, confirmation: { risk: "high", method: "recent-auth", reason: "Issue one-time tokens." }, audit: "required" },
      redaction: { allowOutputPaths: ["$.item.token", "$.items[*].token"] },
      target: { resource: "records", collection: true },
      mcp: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    }] });
    const registry = createAdminRegistry({
      adapters: [createAdminCapabilityAdapter(manifest, {
        "examplefn.records.issue-token-set": async () => ({
          ok: true as const,
          data: {
            item: { token: "allowed-object", nested: { token: "blocked-nested" } },
            items: [
              { token: "allowed-array-0", nested: { token: "blocked-array-nested" } },
              { token: "allowed-array-1" },
            ],
            token: "blocked-root",
          },
          meta: { item: { token: "blocked-meta" } },
        }),
      })],
      enabledModules: ["examplefn"],
    });
    const result = await createAdminDispatcher({
      registry,
      audit: new MemoryAdminAuditSink(),
      confirmation: { verify: () => true },
    }).dispatch({
      operationId: "examplefn.records.issue-token-set",
      input: {},
      context: context({ confirmationToken: "confirmed", actor: { id: "user_1", permissions: ["examplefn.records.issue-token-set"] } }),
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        item: { token: "allowed-object", nested: { token: "[REDACTED]" } },
        items: [
          { token: "allowed-array-0", nested: { token: "[REDACTED]" } },
          { token: "allowed-array-1" },
        ],
        token: "[REDACTED]",
      },
      meta: { item: { token: "[REDACTED]" } },
    });
    expect(JSON.stringify(result)).not.toContain("blocked-");
  });

  it("rejects unexpected one-time-secret parents without leaking their contents", async () => {
    const base = testManifest().operations[0]!;
    const manifest = testManifest("examplefn", { operations: [{
      ...base,
      id: "examplefn.records.issue-closed-token",
      outputSchema: {
        type: "object",
        properties: { item: { type: "object", properties: { token: { type: "string" } }, required: ["token"], additionalProperties: false } },
        required: ["item"],
        additionalProperties: false,
      },
      route: { method: "POST", path: "/records/actions/issue-closed-token" },
      permission: "examplefn.records.issue-closed-token",
      safety: { classification: "write", idempotent: false, requiresConfirmation: true, confirmation: { risk: "high", method: "recent-auth", reason: "Issue token." }, audit: "required" },
      redaction: { allowOutputPaths: ["$.item.token"] },
      target: { resource: "records", collection: true },
      mcp: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    }] });
    const audit = new MemoryAdminAuditSink();
    const registry = createAdminRegistry({ adapters: [createAdminCapabilityAdapter(manifest, {
      "examplefn.records.issue-closed-token": async () => ({ ok: true as const, data: { item: { token: "allowed" }, unexpected: { token: "unexpected-secret" } } }),
    })], enabledModules: ["examplefn"] });
    const result = await createAdminDispatcher({ registry, audit, confirmation: { verify: () => true } }).dispatch({
      operationId: "examplefn.records.issue-closed-token",
      input: {},
      context: context({ confirmationToken: "confirmed", actor: { id: "user_1", permissions: ["examplefn.records.issue-closed-token"] } }),
    });
    expect(result).toMatchObject({ ok: false, error: { code: "internal" } });
    expect(JSON.stringify({ result, events: audit.events })).not.toContain("unexpected-secret");
  });

  it("atomically reserves an idempotency key so concurrent requests execute once", async () => {
    const base = testManifest().operations[0]!;
    const manifest = testManifest("examplefn", { operations: [{
      ...base,
      id: "examplefn.records.refresh",
      outputSchema: { type: "object", properties: { accepted: { type: "boolean" } }, required: ["accepted"], additionalProperties: false },
      route: { method: "POST", path: "/records/refresh" },
      permission: "examplefn.records.refresh",
      safety: { classification: "write", idempotent: true, audit: "required" },
      mcp: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    }] });
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const handler = vi.fn(async () => { await blocked; return { ok: true as const, data: { accepted: true } }; });
    const registry = createAdminRegistry({ adapters: [createAdminCapabilityAdapter(manifest, { "examplefn.records.refresh": handler })], enabledModules: ["examplefn"] });
    const dispatcher = createAdminDispatcher({ registry, audit: new MemoryAdminAuditSink(), idempotency: new MemoryAdminIdempotencyStore() });
    const mutationContext = context({ actor: { id: "user_1", permissions: ["examplefn.records.refresh"] }, idempotencyKey: "atomic" });
    const first = dispatcher.dispatch({ operationId: "examplefn.records.refresh", input: {}, context: mutationContext });
    const second = dispatcher.dispatch({ operationId: "examplefn.records.refresh", input: {}, context: { ...mutationContext, requestId: "req_2" } });
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1));
    release();
    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult).toMatchObject({ ok: true, data: { accepted: true } });
    expect(secondResult).toMatchObject({ ok: true, data: { accepted: true }, meta: { idempotencyReplay: true } });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
