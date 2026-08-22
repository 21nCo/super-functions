import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { allocateEphemeralPort, FilePortRegistry, isPortAvailable, renderPolicyInventory, resolvePolicy } from "../src/index.js";

describe("FilePortRegistry", () => {
  it("gives concurrent worktrees distinct deterministic allocations", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "devfn-registry-"));
    const registry = new FilePortRegistry(path.join(dir, "registry.json"));
    const reserve = (instanceId: string, invocationId: string) => registry.reserve({ projectId: "app", instanceId, invocationId, profile: "default", requests: [{ name: "app", spec: { range: [43000, 43100] } }] });
    const [first, second] = await Promise.all([reserve("worktree-a", "one"), reserve("worktree-b", "two")]);
    expect(first[0].port).not.toBe(second[0].port);
    expect((await registry.read()).revision).toBe(2);
    const freshDir = await mkdtemp(path.join(tmpdir(), "devfn-registry-"));
    const repeated = await new FilePortRegistry(path.join(freshDir, "registry.json")).reserve({ projectId: "app", instanceId: "worktree-a", invocationId: "repeat", profile: "default", requests: [{ name: "app", spec: { range: [43000, 43100] } }] });
    expect(repeated[0].port).toBe(first[0].port);
  });

  it("fails closed when an exact reservation is already leased", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "devfn-registry-"));
    const registry = new FilePortRegistry(path.join(dir, "registry.json"));
    const exactPort = await allocateEphemeralPort();
    const input = { projectId: "app", profile: "default", requests: [{ name: "oauth", spec: { preferred: exactPort, exact: true } }] } as const;
    await registry.reserve({ ...input, instanceId: "a", invocationId: "one" });
    await expect(registry.reserve({ ...input, instanceId: "b", invocationId: "two" })).rejects.toMatchObject({ code: "DEVFN_PORT_CONFLICT" });
  });

  it("applies project policy ranges and renders them for humans", () => {
    const policy = { version: 1 as const, ports: [{ name: "app-range", range: [45000, 45099] as [number, number], kind: "preferred" as const, project: "app" }] };
    expect(resolvePolicy(policy, "app").preferredRange).toEqual([45000, 45099]);
    expect(renderPolicyInventory(policy)).toContain("45000-45099");
  });

  it("preserves contiguous exact blocks", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "devfn-registry-"));
    const registry = new FilePortRegistry(path.join(dir, "registry.json"));
    let firstPort = await allocateEphemeralPort();
    while (!await isPortAvailable(firstPort + 1)) firstPort = await allocateEphemeralPort();
    const allocations = await registry.reserve({
      projectId: "oauth",
      instanceId: "one",
      invocationId: "block",
      profile: "oauth",
      requests: [
        { name: "callback", spec: { preferred: firstPort, exact: true, block: "oauth" } },
        { name: "issuer", spec: { preferred: firstPort + 1, exact: true, block: "oauth" } },
      ],
    });
    expect(allocations.map((item) => item.port)).toEqual([firstPort, firstPort + 1]);
    expect(allocations.every((item) => item.source === "exact")).toBe(true);
  });
});
