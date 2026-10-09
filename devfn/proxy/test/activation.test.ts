import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";

const scan = vi.hoisted(() => ({ unattributable: false }));
vi.mock("@devfn/ports", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@devfn/ports")>();
  return {
    ...actual,
    // A non-dumpable owner (setcap Caddy on Linux) is invisible to same-user
    // socket inspection even though inspection itself succeeds.
    scanListenerState: async (includeDocker?: boolean) => scan.unattributable
      ? { listeners: [], inspection: { tcp: true, udp: true, docker: false } }
      : await actual.scanListenerState(includeDocker),
  };
});

import { isPortAvailable, withFileLock } from "@devfn/ports";
import { CaddyProxyController, proxyListenerPorts, type ProxyRoute } from "../src/index.js";

// Stands in for `caddy run`: its admin endpoint answers immediately, like
// Caddy's, and it confirms startup through --pingback only when told to.
const fakeRun = `import { connect } from "node:net";
import http from "node:http";
import { readFileSync } from "node:fs";
const pingback = process.argv[process.argv.indexOf("--pingback") + 1];
http.createServer((_request, response) => response.end(readFileSync(process.env.DEVFN_TEST_ADMIN_CONFIG, "utf8"))).listen(2019, "127.0.0.1");
if (process.env.DEVFN_TEST_RUN_MODE === "exit-before-pingback") setTimeout(() => process.exit(1), 600);
else {
  const chunks = [];
  process.stdin.on("data", (chunk) => chunks.push(chunk));
  process.stdin.on("end", () => { const socket = connect(Number(pingback.split(":").pop()), "127.0.0.1", () => socket.end(Buffer.concat(chunks))); });
  setInterval(() => undefined, 1000);
}
`;

let stateDir: string;
let toolsDir: string;
const originalEnv = { ...process.env };
const route = (instanceId: string, id = `${instanceId}-app`): Omit<ProxyRoute, "updatedAt"> =>
  ({ id, instanceId, hostname: `${id}.localhost`, targetHost: "127.0.0.1", targetPort: 4100, tls: "off" });

async function stopOwner(): Promise<void> {
  try {
    const { pid } = JSON.parse(await readFile(path.join(stateDir, "proxy-owner.json"), "utf8")) as { pid: number };
    try { process.kill(-pid, "SIGTERM"); } catch { process.kill(pid, "SIGTERM"); }
    for (let attempt = 0; attempt < 50 && await isPortAvailable(2019) === false; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 50));
  } catch { /* no owner was started */ }
}

async function setUp(): Promise<void> {
  stateDir = await mkdtemp(path.join(tmpdir(), "devfn-proxy-activation-"));
  toolsDir = await mkdtemp(path.join(tmpdir(), "devfn-proxy-activation-tools-"));
  await writeFile(path.join(toolsDir, "fake-run.mjs"), fakeRun);
  // `caddy adapt` of the committed Caddyfile and the live admin config.
  await writeFile(path.join(toolsDir, "adapted.json"), JSON.stringify({ admin: { listen: "127.0.0.1:2019" } }));
  await writeFile(path.join(toolsDir, "admin.json"), JSON.stringify({ admin: { listen: "127.0.0.1:2019" } }));
  await writeFile(path.join(toolsDir, "caddy"), `#!/bin/sh
case "$1" in
  version|validate|reload) exit 0;;
  adapt) cat "$DEVFN_TEST_ADAPTED"; exit 0;;
  run) exec "${process.execPath}" "${path.join(toolsDir, "fake-run.mjs")}" "$@";;
esac
exit 1
`, { mode: 0o700 });
  process.env.PATH = `${toolsDir}${path.delimiter}${originalEnv.PATH ?? ""}`;
  process.env.DEVFN_TEST_ADMIN_CONFIG = path.join(toolsDir, "admin.json");
  process.env.DEVFN_TEST_ADAPTED = path.join(toolsDir, "adapted.json");
}

async function tearDown(): Promise<void> {
  scan.unattributable = false;
  await stopOwner();
  process.env = { ...originalEnv };
  await rm(stateDir, { recursive: true, force: true });
  await rm(toolsDir, { recursive: true, force: true });
}

// The controller's admin endpoint is fixed at 127.0.0.1:2019. Fixtures in
// other DevFn packages that need it free take the same machine-wide lock.
function adminTest(name: string, body: () => Promise<void>): void {
  it(name, async () => await withFileLock(path.join(tmpdir(), "devfn-test-caddy-admin.lock"), async () => {
    await setUp();
    try { await body(); } finally { await tearDown(); }
  }, { timeoutMs: 120_000 }), 150_000);
}

adminTest("does not commit a spawned Caddy whose admin answers but which exits before confirming its listeners", async () => {
  process.env.DEVFN_TEST_RUN_MODE = "exit-before-pingback";
  const proxy = new CaddyProxyController(stateDir, undefined, undefined, async () => true);
  await expect(proxy.upsert([route("fixture")])).rejects.toMatchObject({ code: "DEVFN_PROXY_RELOAD_FAILED" });
  await expect(access(path.join(stateDir, "proxy-routes.json"))).rejects.toMatchObject({ code: "ENOENT" });
  await expect(access(path.join(stateDir, "proxy-routes.pending.json"))).rejects.toMatchObject({ code: "ENOENT" });
  await expect(access(path.join(stateDir, "proxy-owner.json"))).rejects.toMatchObject({ code: "ENOENT" });
});

adminTest("commits a confirmed Caddy start and reports instance routes live only while its owner and listeners are", async () => {
  process.env.DEVFN_TEST_RUN_MODE = "pingback";
  let accepting = true;
  const proxy = new CaddyProxyController(stateDir, undefined, undefined, async () => accepting);
  const activated = await proxy.upsert([route("fixture")]);
  expect(await proxy.instanceRoutesLive("fixture", activated)).toBe(true);
  expect(await proxy.instanceRoutesLive("fixture", [{ ...activated[0], targetPort: 4101 }])).toBe(false);
  expect(await proxy.instanceRoutesLive("fixture", [])).toBe(false);
  expect(await proxy.instanceRoutesLive("unrouted", [])).toBe(true);
  accepting = false;
  expect(await proxy.instanceRoutesLive("fixture", activated)).toBe(false);
  accepting = true;
  await stopOwner();
  expect(await proxy.instanceRoutesLive("fixture", activated)).toBe(false);
});

adminTest("accepts an owner hidden from socket inspection only when its live admin config is DevFn's committed config", async () => {
  process.env.DEVFN_TEST_RUN_MODE = "pingback";
  const { httpPort, httpsPort } = proxyListenerPorts();
  await new CaddyProxyController(stateDir, undefined, undefined, async () => true).upsert([route("fixture")]);
  scan.unattributable = true;
  const probed: number[] = [];
  const inspected = new CaddyProxyController(stateDir, undefined, undefined, async (port) => { probed.push(port); return true; });
  await expect(inspected.assertActivationReady([route("sibling")], "sibling")).resolves.toBeUndefined();
  // Only listeners of the committed TLS-off configuration count as owned;
  // HTTPS still has to be provably free.
  expect(probed).toContain(httpPort);
  expect(probed).not.toContain(httpsPort);
  probed.length = 0;
  await writeFile(path.join(toolsDir, "admin.json"), JSON.stringify({ admin: { listen: "127.0.0.1:2019" }, apps: { foreign: {} } }));
  await expect(inspected.assertActivationReady([route("sibling")], "sibling")).rejects.toMatchObject({ code: "DEVFN_PROXY_OWNERSHIP_CONFLICT" });
  expect(probed).toEqual([]);
});
