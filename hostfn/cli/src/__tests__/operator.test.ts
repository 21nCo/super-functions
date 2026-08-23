import { describe, expect, it, vi } from "vitest";
import {
  HostFnOperatorService,
  MemoryHostFnOperatorStore,
  type HostFnDeploymentExecutor,
  type HostFnDeployment,
  type HostFnScope,
  type HostFnTarget,
} from "../operator.js";

const scope: HostFnScope = {
  installationId: "installation_1",
  workspaceId: "workspace_1",
  projectId: "project_1",
  environmentId: "production",
};

describe("MemoryHostFnOperatorStore", () => {
  it("keeps slash-bearing scope tuples isolated", async () => {
    const store = new MemoryHostFnOperatorStore();
    const firstScope = { ...scope, installationId: "a/b", workspaceId: "c" };
    const secondScope = { ...scope, installationId: "a", workspaceId: "b/c" };
    const target = (targetScope: HostFnScope, name: string): HostFnTarget => ({
      id: "target_1",
      scope: targetScope,
      name,
      server: "api.example.test",
      runtime: "nodejs",
      status: "ready",
      updatedAt: "2026-08-22T00:00:00.000Z",
    });

    await store.putTarget(target(firstScope, "First"));
    await store.putTarget(target(secondScope, "Second"));

    await expect(store.getTarget(firstScope, "target_1")).resolves.toMatchObject({ name: "First" });
    await expect(store.getTarget(secondScope, "target_1")).resolves.toMatchObject({ name: "Second" });
    await expect(store.listTargets(firstScope)).resolves.toHaveLength(1);
    await expect(store.listTargets(secondScope)).resolves.toHaveLength(1);
  });

  it("returns defensive clones from target and deployment reads", async () => {
    const store = new MemoryHostFnOperatorStore();
    const target: HostFnTarget = {
      id: "target_1",
      scope,
      name: "API",
      server: "api.example.test",
      runtime: "nodejs",
      status: "ready",
      updatedAt: "2026-08-22T00:00:00.000Z",
    };
    const deployment: HostFnDeployment = {
      id: "deployment_1",
      scope,
      targetId: target.id,
      revision: "git:abc123",
      status: "queued",
      createdAt: "2026-08-22T00:00:00.000Z",
      updatedAt: "2026-08-22T00:00:00.000Z",
    };
    await store.putTarget(target);
    await store.putDeployment(deployment);

    const listedTarget = (await store.listTargets(scope))[0]!;
    listedTarget.id = "mutated";
    listedTarget.scope.projectId = "other_project";
    const fetchedTarget = await store.getTarget(scope, target.id);
    expect(fetchedTarget).toEqual(target);
    fetchedTarget!.name = "Mutated API";
    expect(await store.getTarget(scope, target.id)).toEqual(target);

    const listedDeployment = (await store.listDeployments(scope))[0]!;
    listedDeployment.status = "failed";
    listedDeployment.scope.environmentId = "staging";
    const fetchedDeployment = await store.getDeployment(scope, deployment.id);
    expect(fetchedDeployment).toEqual(deployment);
    fetchedDeployment!.revision = "git:mutated";
    expect(await store.getDeployment(scope, deployment.id)).toEqual(deployment);
  });

  it("keeps a discoverable pending domain when the provider succeeds but activation persistence fails", async () => {
    class ActivationFailureStore extends MemoryHostFnOperatorStore {
      private failActivationOnce = true;
      override async completeDomainAttachment(
        domain: Parameters<MemoryHostFnOperatorStore["completeDomainAttachment"]>[0],
        claimToken: string,
      ) {
        if (domain.status === "active" && this.failActivationOnce) {
          this.failActivationOnce = false;
          throw new Error("activation persistence unavailable");
        }
        return super.completeDomainAttachment(domain, claimToken);
      }
    }
    const store = new ActivationFailureStore();
    const target: HostFnTarget = {
      id: "target_1",
      scope,
      name: "API",
      server: "api.example.test",
      runtime: "nodejs",
      status: "ready",
      updatedAt: "2026-08-22T00:00:00.000Z",
    };
    await store.putTarget(target);
    const attachDomain = vi.fn(async () => undefined);
    const executor: HostFnDeploymentExecutor = {
      deploy: async () => undefined,
      cancel: async () => undefined,
      rollback: async () => undefined,
      restart: async () => undefined,
      attachDomain,
      detachDomain: async () => undefined,
      setVariable: async () => undefined,
      deleteVariable: async () => undefined,
    };
    const operator = new HostFnOperatorService(store, executor);

    await expect(operator.attachDomain(scope, {
      targetId: target.id,
      hostname: "api.example.test",
    })).rejects.toThrow("activation persistence unavailable");

    await expect(store.listDomains(scope)).resolves.toEqual([
      expect.objectContaining({ targetId: target.id, hostname: "api.example.test", status: "pending" }),
    ]);
    expect(attachDomain).toHaveBeenCalledTimes(1);
    const [pending] = await store.listDomains(scope);
    await expect(operator.attachDomain(scope, {
      targetId: target.id,
      hostname: "api.example.test",
    })).resolves.toMatchObject({ id: pending!.id, status: "active" });
    expect(attachDomain).toHaveBeenCalledTimes(2);
  });

  it("reuses a failed attachment intent so provider retries converge without duplicate domains", async () => {
    const store = new MemoryHostFnOperatorStore();
    const target: HostFnTarget = {
      id: "target_1",
      scope,
      name: "API",
      server: "api.example.test",
      runtime: "nodejs",
      status: "ready",
      updatedAt: "2026-08-22T00:00:00.000Z",
    };
    await store.putTarget(target);
    let providerUnavailable = true;
    const attemptedDomainIds: string[] = [];
    const attachDomain = vi.fn(async ({ domain }: Parameters<HostFnDeploymentExecutor["attachDomain"]>[0]) => {
      attemptedDomainIds.push(domain.id);
      if (providerUnavailable) throw new Error("provider unavailable");
    });
    const executor: HostFnDeploymentExecutor = {
      deploy: async () => undefined,
      cancel: async () => undefined,
      rollback: async () => undefined,
      restart: async () => undefined,
      attachDomain,
      detachDomain: async () => undefined,
      setVariable: async () => undefined,
      deleteVariable: async () => undefined,
    };
    const operator = new HostFnOperatorService(store, executor);

    await expect(operator.attachDomain(scope, {
      targetId: target.id,
      hostname: "api.example.test",
    })).rejects.toThrow("provider unavailable");
    const [failed] = await store.listDomains(scope);
    expect(failed).toMatchObject({ status: "failed", hostname: "api.example.test" });

    providerUnavailable = false;
    await expect(operator.attachDomain(scope, {
      targetId: target.id,
      hostname: "api.example.test",
    })).resolves.toMatchObject({ id: failed!.id, status: "active" });
    await expect(store.listDomains(scope)).resolves.toHaveLength(1);
    expect(new Set(attemptedDomainIds).size).toBe(1);
    await expect(operator.attachDomain(scope, {
      targetId: target.id,
      hostname: "api.example.test",
      tls: false,
    })).rejects.toThrow("different TLS configuration");
    expect(attachDomain).toHaveBeenCalledTimes(2);
  });

  it("serializes concurrent attachment requests for the same domain", async () => {
    const store = new MemoryHostFnOperatorStore();
    const target: HostFnTarget = {
      id: "target_1", scope, name: "API", server: "api.example.test", runtime: "nodejs",
      status: "ready", updatedAt: "2026-08-22T00:00:00.000Z",
    };
    await store.putTarget(target);
    let releaseProvider!: () => void;
    const providerGate = new Promise<void>((resolve) => { releaseProvider = resolve; });
    const attachDomain = vi.fn(async () => providerGate);
    const executor: HostFnDeploymentExecutor = {
      deploy: async () => undefined, cancel: async () => undefined, rollback: async () => undefined,
      restart: async () => undefined, attachDomain, detachDomain: async () => undefined,
      setVariable: async () => undefined, deleteVariable: async () => undefined,
    };
    const operator = new HostFnOperatorService(store, executor);
    const first = operator.attachDomain(scope, { targetId: target.id, hostname: "api.example.test" });
    const second = operator.attachDomain(scope, { targetId: target.id, hostname: "api.example.test" });
    await vi.waitFor(() => expect(attachDomain).toHaveBeenCalledTimes(1));
    releaseProvider();
    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(secondResult.id).toBe(firstResult.id);
    expect(await store.listDomains(scope)).toHaveLength(1);
  });

  it("atomically reserves one attachment identity across service instances", async () => {
    const store = new MemoryHostFnOperatorStore();
    const target: HostFnTarget = {
      id: "target_1", scope, name: "API", server: "api.example.test", runtime: "nodejs",
      status: "ready", updatedAt: "2026-08-22T00:00:00.000Z",
    };
    await store.putTarget(target);
    let releaseProvider!: () => void;
    const providerGate = new Promise<void>((resolve) => { releaseProvider = resolve; });
    const attachDomain = vi.fn(async () => providerGate);
    const executor: HostFnDeploymentExecutor = {
      deploy: async () => undefined, cancel: async () => undefined, rollback: async () => undefined,
      restart: async () => undefined, attachDomain, detachDomain: async () => undefined,
      setVariable: async () => undefined, deleteVariable: async () => undefined,
    };
    const firstService = new HostFnOperatorService(store, executor);
    const secondService = new HostFnOperatorService(store, executor);
    const first = firstService.attachDomain(scope, { targetId: target.id, hostname: "api.example.test" });
    await vi.waitFor(() => expect(attachDomain).toHaveBeenCalledTimes(1));
    const second = await secondService.attachDomain(scope, { targetId: target.id, hostname: "api.example.test" });
    expect(second).toMatchObject({ status: "pending" });
    releaseProvider();
    const completed = await first;
    expect(second.id).toBe(completed.id);
    expect(attachDomain).toHaveBeenCalledTimes(1);
    await expect(store.listDomains(scope)).resolves.toEqual([expect.objectContaining({ id: completed.id, status: "active" })]);
  });

  it("prevents an expired attachment worker from overwriting a reclaimed result", async () => {
    class ClaimCapturingStore extends MemoryHostFnOperatorStore {
      firstClaimToken?: string;
      override async claimDomainAttachment(domain: Parameters<MemoryHostFnOperatorStore["claimDomainAttachment"]>[0]) {
        const claim = await super.claimDomainAttachment(domain);
        if (!this.firstClaimToken && claim.claimToken) this.firstClaimToken = claim.claimToken;
        return claim;
      }
    }
    const store = new ClaimCapturingStore();
    const target: HostFnTarget = {
      id: "target_1", scope, name: "API", server: "api.example.test", runtime: "nodejs",
      status: "ready", updatedAt: "2026-08-22T00:00:00.000Z",
    };
    await store.putTarget(target);
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    let providerCalls = 0;
    const attachDomain = vi.fn(async () => {
      providerCalls += 1;
      if (providerCalls === 1) {
        await firstGate;
        throw new Error("stale provider failure");
      }
    });
    const executor: HostFnDeploymentExecutor = {
      deploy: async () => undefined, cancel: async () => undefined, rollback: async () => undefined,
      restart: async () => undefined, attachDomain, detachDomain: async () => undefined,
      setVariable: async () => undefined, deleteVariable: async () => undefined,
    };
    const firstService = new HostFnOperatorService(store, executor);
    const secondService = new HostFnOperatorService(store, executor);
    const first = firstService.attachDomain(scope, { targetId: target.id, hostname: "api.example.test" });
    await vi.waitFor(() => expect(attachDomain).toHaveBeenCalledTimes(1));
    const [pending] = await store.listDomains(scope);
    await store.releaseDomainAttachmentClaim(scope, pending!.id, store.firstClaimToken!);

    const reclaimed = await secondService.attachDomain(scope, { targetId: target.id, hostname: "api.example.test" });
    expect(reclaimed).toMatchObject({ id: pending!.id, status: "active" });
    releaseFirst();
    await expect(first).resolves.toMatchObject({ id: pending!.id, status: "active" });
    await expect(store.listDomains(scope)).resolves.toEqual([
      expect.objectContaining({ id: pending!.id, status: "active" }),
    ]);
    expect(attachDomain).toHaveBeenCalledTimes(2);
  });

  it("does not recreate a pending domain deleted while attachment is in flight", async () => {
    const store = new MemoryHostFnOperatorStore();
    const target: HostFnTarget = {
      id: "target_1", scope, name: "API", server: "api.example.test", runtime: "nodejs",
      status: "ready", updatedAt: "2026-08-22T00:00:00.000Z",
    };
    await store.putTarget(target);
    let releaseProvider!: () => void;
    const providerGate = new Promise<void>((resolve) => { releaseProvider = resolve; });
    const detachDomain = vi.fn(async () => undefined);
    const executor: HostFnDeploymentExecutor = {
      deploy: async () => undefined, cancel: async () => undefined, rollback: async () => undefined,
      restart: async () => undefined, attachDomain: async () => providerGate, detachDomain,
      setVariable: async () => undefined, deleteVariable: async () => undefined,
    };
    const attachingService = new HostFnOperatorService(store, executor);
    const detachingService = new HostFnOperatorService(store, executor);
    const attaching = attachingService.attachDomain(scope, { targetId: target.id, hostname: "api.example.test" });
    await vi.waitFor(async () => expect(await store.listDomains(scope)).toHaveLength(1));
    const [pending] = await store.listDomains(scope);

    await expect(detachingService.detachDomain(scope, pending!.id)).resolves.toMatchObject({ status: "pending" });
    releaseProvider();
    await expect(attaching).rejects.toThrow("attachment lease was superseded");
    await expect(store.listDomains(scope)).resolves.toEqual([]);
    expect(detachDomain).toHaveBeenCalledTimes(2);
    expect(detachDomain).toHaveBeenLastCalledWith(expect.objectContaining({ domain: expect.objectContaining({ id: pending!.id }) }));
  });

  it("retains a retryable intent when deleted-domain compensation fails", async () => {
    const store = new MemoryHostFnOperatorStore();
    const target: HostFnTarget = {
      id: "target_1", scope, name: "API", server: "api.example.test", runtime: "nodejs",
      status: "ready", updatedAt: "2026-08-22T00:00:00.000Z",
    };
    await store.putTarget(target);
    let releaseProvider!: () => void;
    const providerGate = new Promise<void>((resolve) => { releaseProvider = resolve; });
    let detachCalls = 0;
    const detachDomain = vi.fn(async () => {
      detachCalls += 1;
      if (detachCalls === 2) throw new Error("compensation unavailable");
    });
    const executor: HostFnDeploymentExecutor = {
      deploy: async () => undefined, cancel: async () => undefined, rollback: async () => undefined,
      restart: async () => undefined, attachDomain: async () => providerGate, detachDomain,
      setVariable: async () => undefined, deleteVariable: async () => undefined,
    };
    const attachingService = new HostFnOperatorService(store, executor);
    const detachingService = new HostFnOperatorService(store, executor);
    const attaching = attachingService.attachDomain(scope, { targetId: target.id, hostname: "api.example.test" });
    await vi.waitFor(async () => expect(await store.listDomains(scope)).toHaveLength(1));
    const [pending] = await store.listDomains(scope);

    await detachingService.detachDomain(scope, pending!.id);
    releaseProvider();
    await expect(attaching).rejects.toThrow("compensation unavailable");
    await expect(store.listDomains(scope)).resolves.toEqual([
      expect.objectContaining({ id: pending!.id, status: "failed" }),
    ]);
    await expect(detachingService.detachDomain(scope, pending!.id)).resolves.toMatchObject({ status: "failed" });
    await expect(store.listDomains(scope)).resolves.toEqual([]);
    expect(detachDomain).toHaveBeenCalledTimes(3);
  });

  it("persists variable intent before calling the provider", async () => {
    class IntentFailureStore extends MemoryHostFnOperatorStore {
      override async putVariable() {
        throw new Error("variable intent persistence unavailable");
      }
    }
    const store = new IntentFailureStore();
    const target: HostFnTarget = {
      id: "target_1", scope, name: "API", server: "api.example.test", runtime: "nodejs",
      status: "ready", updatedAt: "2026-08-22T00:00:00.000Z",
    };
    await store.putTarget(target);
    const setVariable = vi.fn(async () => undefined);
    const executor: HostFnDeploymentExecutor = {
      deploy: async () => undefined, cancel: async () => undefined, rollback: async () => undefined,
      restart: async () => undefined, attachDomain: async () => undefined, detachDomain: async () => undefined,
      setVariable, deleteVariable: async () => undefined,
    };
    const operator = new HostFnOperatorService(store, executor);

    await expect(operator.setVariable(scope, {
      targetId: target.id,
      key: "API_KEY",
      value: "secret",
    })).rejects.toThrow("variable intent persistence unavailable");
    expect(setVariable).not.toHaveBeenCalled();
  });

  it("reconciles a stale variable record when the provider already deleted it", async () => {
    class LostDeleteStore extends MemoryHostFnOperatorStore {
      private loseFirstAcknowledgement = true;
      override async deleteVariable(variableScope: HostFnScope, id: string) {
        if (this.loseFirstAcknowledgement) {
          this.loseFirstAcknowledgement = false;
          throw new Error("variable deletion persistence unavailable");
        }
        return super.deleteVariable(variableScope, id);
      }
    }
    const store = new LostDeleteStore();
    const target: HostFnTarget = {
      id: "target_1", scope, name: "API", server: "api.example.test", runtime: "nodejs",
      status: "ready", updatedAt: "2026-08-22T00:00:00.000Z",
    };
    await store.putTarget(target);
    const variable = {
      id: `${target.id}:API_KEY`, scope, targetId: target.id, key: "API_KEY",
      updatedAt: "2026-08-22T00:00:00.000Z",
    };
    await store.putVariable(variable, "secret");
    const notFound = Object.assign(new Error("variable not found"), { status: 404 });
    let providerDeletes = 0;
    const executor: HostFnDeploymentExecutor = {
      deploy: async () => undefined, cancel: async () => undefined, rollback: async () => undefined,
      restart: async () => undefined, attachDomain: async () => undefined, detachDomain: async () => undefined,
      setVariable: async () => undefined,
      deleteVariable: async () => { if (providerDeletes++ > 0) throw notFound; },
    };
    const operator = new HostFnOperatorService(store, executor);

    await expect(operator.deleteVariable(scope, variable.id)).rejects.toThrow("variable deletion persistence unavailable");
    await expect(operator.deleteVariable(scope, variable.id)).resolves.toEqual(variable);
    expect(providerDeletes).toBe(2);
    await expect(store.listVariables(scope)).resolves.toEqual([]);
  });

  it("cleans up a failed local intent when the provider reports no matching domain", async () => {
    const store = new MemoryHostFnOperatorStore();
    const target: HostFnTarget = {
      id: "target_1",
      scope,
      name: "API",
      server: "api.example.test",
      runtime: "nodejs",
      status: "ready",
      updatedAt: "2026-08-22T00:00:00.000Z",
    };
    await store.putTarget(target);
    const notFound = Object.assign(new Error("domain not found"), { code: "not_found" });
    const executor: HostFnDeploymentExecutor = {
      deploy: async () => undefined,
      cancel: async () => undefined,
      rollback: async () => undefined,
      restart: async () => undefined,
      attachDomain: async () => { throw new Error("provider unavailable"); },
      detachDomain: async () => { throw notFound; },
      setVariable: async () => undefined,
      deleteVariable: async () => undefined,
    };
    const operator = new HostFnOperatorService(store, executor);
    await expect(operator.attachDomain(scope, {
      targetId: target.id,
      hostname: "api.example.test",
    })).rejects.toThrow("provider unavailable");
    const [failed] = await store.listDomains(scope);

    await expect(operator.detachDomain(scope, failed!.id)).resolves.toMatchObject({ status: "failed" });
    await expect(store.listDomains(scope)).resolves.toEqual([]);
  });
});
