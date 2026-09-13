import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_POLICY } from "@superfunctions/reviewfn-core";
import { initializeConfiguration, loadConfig } from "../src/config.js";
import { LocalIsolatedExecutionAdapter } from "../src/execution.js";
const exec = promisify(execFile);
const roots: string[] = [];
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "reviewfn-cli-test-")); roots.push(root);
  await exec("git", ["init", "-q", root]);
  await writeFile(path.join(root, "README.md"), "fixture\n");
  await writeFile(path.join(root, ".gitattributes"), "README.md export-ignore\n");
  await exec("git", ["add", "."], { cwd: root });
  await exec("git", ["-c", "user.name=ReviewFn", "-c", "user.email=reviewfn@example.invalid", "commit", "-qm", "fixture"], { cwd: root });
  const head = (await exec("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();
  return { root, head };
}
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); delete process.env.REVIEWFN_TEST_SECRET; });
it("initializes defaults without overwriting", async () => {
  const { root } = await fixture();
  expect(await initializeConfiguration(root)).toHaveLength(2);
  expect((await loadConfig(path.join(root, ".reviewfn/config.json"))).version).toBe(1);
  await expect(initializeConfiguration(root)).rejects.toThrow(/overwrite/);
});
describe.runIf(process.env.REVIEWFN_DOCKER_TESTS === "1")("Docker execution boundary", () => {
  it("runs exact committed bytes without host secrets, network, or writable host files", async () => {
    const { root, head } = await fixture();
    await writeFile(path.join(root, "README.md"), "dirty\n");
    process.env.REVIEWFN_TEST_SECRET = "do-not-copy";
    const script = `const fs=require('fs'); if(process.env.REVIEWFN_TEST_SECRET)process.exit(8); if(fs.readFileSync('README.md','utf8')!=='fixture\\n')process.exit(9); try {fs.writeFileSync('/etc/escape','bad');process.exit(10)}catch{}; if(fs.existsSync('/var/run/docker.sock'))process.exit(11); const net=require('net');const socket=net.connect({host:'1.1.1.1',port:443});socket.on('connect',()=>process.exit(12));socket.on('error',()=>process.exit(0));setTimeout(()=>process.exit(0),300);`;
    const receipts = await new LocalIsolatedExecutionAdapter().run(root, head, [["node", "-e", script]], DEFAULT_POLICY);
    expect(receipts[0].exitCode).toBe(0);
    expect(receipts[0].commit).toBe(head);
    expect(await readFile(path.join(root, "README.md"), "utf8")).toBe("dirty\n");
  }, 30_000);
  it("kills detached descendants and removes containers after timeout", async () => {
    const { root, head } = await fixture();
    const policy = { ...DEFAULT_POLICY, limits: { ...DEFAULT_POLICY.limits, testTimeoutMs: 1500 } };
    const receipts = await new LocalIsolatedExecutionAdapter().run(root, head, [["node", "-e", "require('child_process').spawn('node',['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'}).unref();setInterval(()=>{},1000)"]], policy);
    expect(receipts[0].timedOut).toBe(true);
    expect((await exec("docker", ["ps", "-a", "--filter", "name=reviewfn-", "--format", "{{.Names}}"])).stdout.trim()).toBe("");
  }, 30_000);
  it("records nonzero exits and kills descendants even on parent success", async () => {
    const { root, head } = await fixture();
    const receipts = await new LocalIsolatedExecutionAdapter().run(root, head, [["node", "-e", "process.exit(7)"], ["node", "-e", "require('child_process').spawn('node',['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'}).unref()"]], DEFAULT_POLICY);
    expect(receipts.map(receipt => receipt.exitCode)).toEqual([7, 0]);
    expect((await exec("docker", ["ps", "-a", "--filter", "name=reviewfn-", "--format", "{{.Names}}"])).stdout.trim()).toBe("");
  }, 30_000);
  it("records cancellation and excessive output without passing", async () => {
    const { root, head } = await fixture();
    const policy = { ...DEFAULT_POLICY, limits: { ...DEFAULT_POLICY.limits, maxOutputBytes: 1000 } };
    const receipt = (await new LocalIsolatedExecutionAdapter().run(root, head, [["node", "-e", "console.log('x'.repeat(10000))"]], policy))[0];
    expect(receipt.exitCode).not.toBe(0);
    expect(receipt.limitations).toContain("Command exceeded output budget.");
    const controller = new AbortController();
    const timer = setInterval(() => { void exec("docker", ["ps", "--filter", "name=reviewfn-", "--format", "{{.Names}}" ]).then(result => { if (result.stdout.trim()) controller.abort(); }); }, 200);
    try {
      const receipts = await new LocalIsolatedExecutionAdapter().run(root, head, [["node", "-e", "setInterval(()=>{},1000)"]], DEFAULT_POLICY, controller.signal);
      expect(receipts[0].canceled).toBe(true);
    } finally { clearTimeout(timer); }
  }, 30_000);
});
