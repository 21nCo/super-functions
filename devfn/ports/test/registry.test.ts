import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { allocateEphemeralPort, FilePortRegistry, isPortAvailable, renderPolicyInventory, resolvePolicy, withFileLock } from "../src/index.js";

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
    let firstPort = 0;
    let allocations: Awaited<ReturnType<typeof registry.reserve>> | undefined;
    for (let attempt = 0; attempt < 20 && !allocations; attempt += 1) {
      firstPort = await allocateEphemeralPort();
      if (firstPort >= 65535 || !await isPortAvailable(firstPort) || !await isPortAvailable(firstPort + 1)) continue;
      allocations = await registry.reserve({
        projectId: "oauth", instanceId: "one", invocationId: `block-${attempt}`, profile: "oauth",
        requests: [
          { name: "callback", spec: { preferred: firstPort, exact: true, block: "oauth" } },
          { name: "issuer", spec: { preferred: firstPort + 1, exact: true, block: "oauth" } },
        ],
      }).catch(() => undefined);
    }
    expect(allocations).toBeDefined();
    expect(allocations!.map((item) => item.port)).toEqual([firstPort, firstPort + 1]);
    expect(allocations!.every((item) => item.source === "exact")).toBe(true);
  });

  it("recovers ownerless stale lock directories", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "devfn-lock-"));
    const lockPath = path.join(dir, "registry.lock");
    await mkdir(lockPath);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await expect(withFileLock(lockPath, async () => "acquired", { staleMs: 1, timeoutMs: 1000 })).resolves.toBe("acquired");
  });

  it("refreshes planned allocations with the lifecycle heartbeat", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "devfn-registry-"));
    const registry = new FilePortRegistry(path.join(dir, "registry.json"));
    await registry.reserve({ projectId: "app", instanceId: "one", invocationId: "starting", profile: "default", requests: [{ name: "app", spec: { range: [45100, 45199] } }] });
    const before = (await registry.read()).allocations[0].updatedAt;
    await new Promise((resolve) => setTimeout(resolve, 5));
    await registry.updateInvocation("starting", { state: "starting" });
    expect(Date.parse((await registry.read()).allocations[0].updatedAt)).toBeGreaterThan(Date.parse(before));
  });

  it("does not refresh planned allocations after an invocation becomes terminal", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "devfn-registry-"));
    const registry = new FilePortRegistry(path.join(dir, "registry.json"));
    await registry.reserve({ projectId: "app", instanceId: "one", invocationId: "failed", profile: "default", requests: [{ name: "app", spec: { range: [45200, 45299] } }] });
    const before = (await registry.read()).allocations[0].updatedAt;
    await new Promise((resolve) => setTimeout(resolve, 5));
    await registry.updateInvocation("failed", { state: "failed" });
    const after = await registry.read();
    expect(after.invocations[0].state).toBe("failed");
    expect(after.allocations[0].updatedAt).toBe(before);
  });

  it("escapes backslashes, pipes, and carriage returns in policy tables", () => {
    const output = renderPolicyInventory({ version: 1, ports: [{ name: "a\\|b\rc", kind: "protected", port: 4100 }] });
    expect(output).toContain("a\\\\\\|b c");
  });
});
