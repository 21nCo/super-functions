import { execFile } from "node:child_process";
import { mkdtemp, realpath, mkdir, readFile, writeFile, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";
const exec = promisify(execFile);
it("installs outside PR dependencies, passes literal argv and rejects hostile versions", async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "reviewfn-action-")));
  try {
    const yaml = await readFile(new URL("../action.yml", import.meta.url).pathname.replace('/test/../','/'), "utf8").catch(() => readFile(path.resolve("action.yml"), "utf8"));
    const script = yaml.split("      run: |\n")[1].split("\n").map(line => line.slice(8)).join("\n");
    expect(script).not.toContain("${{");
    const workspace = path.join(root, "checkout");
    const runnerTemp = path.join(root, "temp");
    const localPackage = path.join(workspace, "node_modules/@superfunctions/reviewfn-cli");
    await mkdir(localPackage, { recursive: true });
    await mkdir(path.join(workspace, "node_modules/.bin"), { recursive: true });
    await mkdir(runnerTemp);
    const userConfig = path.join(runnerTemp, "npmrc.user");
    const globalConfig = path.join(runnerTemp, "npmrc.global");
    await writeFile(userConfig, ""); await writeFile(globalConfig, "");
    const npm = path.join(path.dirname(process.execPath), "npm");
    const registry = await exec(npm, ["config", "get", "registry", `--userconfig=${userConfig}`, `--globalconfig=${globalConfig}`, "--registry=https://registry.npmjs.org"], { cwd: runnerTemp });
    expect(new URL(registry.stdout.trim()).href).toBe("https://registry.npmjs.org/");
    await writeFile(path.join(localPackage, "package.json"), JSON.stringify({ name: "@superfunctions/reviewfn-cli", version: "0.1.0", bin: { reviewfn: "../../.bin/reviewfn" } }));
    const malicious = path.join(workspace, "node_modules/.bin/reviewfn");
    await writeFile(malicious, `#!${process.execPath}\nrequire('fs').writeFileSync(${JSON.stringify(path.join(root, "local-binary-ran"))}, 'bad')\n`);
    await chmod(malicious, 0o700);
    // Controlled installer exercises the actual Action shell and installed entrypoint.
    const executable = path.join(root, "npm");
    await writeFile(executable, `#!${process.execPath}
const fs=require('fs'),path=require('path');
const args=process.argv.slice(2),prefix=args[args.indexOf('--prefix')+1];
if(args[0]!=='install'||!args.includes('--ignore-scripts')||process.cwd()!==prefix||prefix.startsWith(process.env.GITHUB_WORKSPACE+path.sep))process.exit(8);
const target=path.join(prefix,'node_modules/@superfunctions/reviewfn-cli/dist');fs.mkdirSync(target,{recursive:true});
fs.writeFileSync(path.join(target,'main.js'),"require('fs').writeFileSync(process.env.ARGV_FILE,JSON.stringify({args:process.argv.slice(2),cwd:process.cwd()}))");
`);
    await chmod(executable, 0o700);
    const hostile = `$(touch ${path.join(root, 'injected')}); \" literal`;
    const env = { PATH: `${root}:${process.env.PATH}`, RUNNER_TEMP: runnerTemp, GITHUB_WORKSPACE: workspace, REVIEWFN_VERSION: "0.1.0", REVIEWFN_BASE: "a".repeat(40), REVIEWFN_HEAD: "b".repeat(40), REVIEWFN_PR: "1", REVIEWFN_ISSUE: hostile, REVIEWFN_OUTPUT: path.join(root, "output"), ARGV_FILE: path.join(root, "args.json") };
    await exec("bash", ["-c", script], { cwd: workspace, env });
    const captured = JSON.parse(await readFile(env.ARGV_FILE, "utf8"));
    expect(captured.args).toContain(hostile);
    expect(captured.args[captured.args.indexOf("--root") + 1]).toBe(workspace);
    expect(captured.cwd.startsWith(runnerTemp + path.sep)).toBe(true);
    await expect(readFile(path.join(root, "local-binary-ran"))).rejects.toThrow();
    await expect(readFile(path.join(root, "injected"))).rejects.toThrow();
    await expect(readFile(path.join(captured.cwd, "node_modules/@superfunctions/reviewfn-cli/dist/main.js"))).rejects.toThrow();
    await expect(exec("bash", ["-c", script], { cwd: workspace, env: { ...env, REVIEWFN_VERSION: hostile } })).rejects.toThrow();
  } finally { await rm(root, { recursive: true, force: true }); }
});
