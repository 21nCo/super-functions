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
      override async putDomain(domain: Parameters<MemoryHostFnOperatorStore["putDomain"]>[0]) {
        if (domain.status === "active") throw new Error("activation persistence unavailable");
        await super.putDomain(domain);
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
