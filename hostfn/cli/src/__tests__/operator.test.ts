import { describe, expect, it } from "vitest";
import {
  MemoryHostFnOperatorStore,
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
});
