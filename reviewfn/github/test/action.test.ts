import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";
const exec = promisify(execFile);
it("passes hostile issue text as a literal argv and rejects hostile versions", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "reviewfn-action-"));
  try {
    const yaml = await readFile(new URL("../action.yml", import.meta.url).pathname.replace('/test/../','/'), "utf8").catch(() => readFile(path.resolve("action.yml"), "utf8"));
    const script = yaml.split("      run: |\n")[1].split("\n").map(line => line.slice(8)).join("\n");
    expect(script).not.toContain("${{");
    const executable = path.join(root, "npx");
    await writeFile(executable, `#!${process.execPath}\nrequire('fs').writeFileSync(process.env.ARGV_FILE,JSON.stringify(process.argv.slice(2)))\n`); await chmod(executable, 0o700);
    const hostile = `$(touch ${path.join(root, 'injected')}); \" literal`;
    const env = { PATH: `${root}:${process.env.PATH}`, REVIEWFN_VERSION: "0.1.0", REVIEWFN_BASE: "a".repeat(40), REVIEWFN_HEAD: "b".repeat(40), REVIEWFN_PR: "1", REVIEWFN_ISSUE: hostile, REVIEWFN_OUTPUT: path.join(root, "output"), ARGV_FILE: path.join(root, "args.json") };
    await exec("bash", ["-c", script], { env });
    expect(JSON.parse(await readFile(env.ARGV_FILE, "utf8"))).toContain(hostile);
    await expect(readFile(path.join(root, "injected"))).rejects.toThrow();
    await expect(exec("bash", ["-c", script], { env: { ...env, REVIEWFN_VERSION: hostile } })).rejects.toThrow();
  } finally { await rm(root, { recursive: true, force: true }); }
});
