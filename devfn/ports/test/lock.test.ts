import { access, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";

// Stall the first lock-owner write until released, as a lock creator paused
// by the scheduler would.
const stall = vi.hoisted(() => ({ armed: false, stalled: undefined as (() => void) | undefined, release: undefined as Promise<void> | undefined }));
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    writeFile: async (...args: Parameters<typeof actual.writeFile>) => {
      if (stall.armed && typeof args[0] === "string" && path.basename(args[0]).startsWith("owner")) {
        stall.armed = false;
        stall.stalled?.();
        await stall.release;
      }
      return await actual.writeFile(...args);
    },
  };
});

const { withFileLock } = await import("../src/index.js");

afterEach(() => { stall.armed = false; });

it("never lets a waiter take a lock whose creator is paused before recording its owner", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "devfn-lock-stall-"));
  const lockPath = path.join(dir, "routing.lock");
  let resume!: () => void;
  stall.release = new Promise<void>((resolve) => { resume = resolve; });
  const paused = new Promise<void>((resolve) => { stall.stalled = resolve; });
  stall.armed = true;
  let holders = 0;
  let overlapped = false;
  const hold = (name: string, until: Promise<void>) => async () => {
    holders += 1;
    if (holders > 1) overlapped = true;
    const owner = JSON.parse(await readFile(path.join(lockPath, "owner.json"), "utf8")) as { token: string };
    await until;
    // The lock still records this holder when its work ends.
    expect(JSON.parse(await readFile(path.join(lockPath, "owner.json"), "utf8"))).toEqual(owner);
    holders -= 1;
    return name;
  };
  try {
    const creator = withFileLock(lockPath, hold("creator", Promise.resolve()), { staleMs: 1, timeoutMs: 10_000 });
    await paused;
    // Long past the stale age, a waiter acquires and holds the lock while the
    // creator resumes.
    await new Promise((resolve) => setTimeout(resolve, 20));
    let finishWaiter!: () => void;
    const waiterDone = new Promise<void>((resolve) => { finishWaiter = resolve; });
    let waiterHolds!: () => void;
    const waiterHolding = new Promise<void>((resolve) => { waiterHolds = resolve; });
    const waiter = withFileLock(lockPath, async () => { waiterHolds(); return await hold("waiter", waiterDone)(); }, { staleMs: 1, timeoutMs: 10_000 });
    await waiterHolding;
    resume();
    await new Promise((resolve) => setTimeout(resolve, 200));
    finishWaiter();
    await expect(Promise.all([creator, waiter])).resolves.toEqual(["creator", "waiter"]);
    expect(overlapped).toBe(false);
    // Neither leaves a lock or a staged directory behind.
    await expect(access(lockPath)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readdir(dir)).toEqual([]);
  } finally {
    resume?.();
    await rm(dir, { recursive: true, force: true });
  }
});
