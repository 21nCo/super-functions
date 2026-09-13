import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export async function consumerSmoke(consumer) {
  const { DEFAULT_CONFIG, DEFAULT_POLICY, resolveTrustedExecutable } = await import(pathToFileURL(path.join(consumer, "node_modules/@superfunctions/reviewfn-core/dist/index.js")));
  const gitExecutable = await resolveTrustedExecutable("git");
  const fixture = path.join(consumer, "fixture"); mkdirSync(fixture);
  const binary = path.join(consumer, "node_modules/@superfunctions/reviewfn-cli/dist/main.js");
  const run = args => execFileSync(process.execPath, [binary, ...args], { cwd: fixture, encoding: "utf8", timeout: 60_000, env: { ...process.env, GITHUB_TOKEN: "", GITHUB_BASE_REF: "unrelated-workflow-base", REVIEWFN_SMOKE_AUTH: "fixture-only-noncredential" } });
  run(["init"]);
  const harness = path.join(consumer, "fixture-codex.cjs");
  writeFileSync(harness, `#!${process.execPath}
const fs=require('fs'),cp=require('child_process');
if(process.argv.includes('--version')){console.log('fixture-codex 1');process.exit(0)}
const head=cp.execFileSync(${JSON.stringify(gitExecutable)},['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const remote=cp.execFileSync(${JSON.stringify(gitExecutable)},['config','--get','remote.origin.url'],{encoding:'utf8'});if(remote.includes('sensitive-user'))process.exit(9);
const output={requirements:[{id:'r',statement:'Return the value',sources:[{sourceId:'repo:README.md',anchor:'L1'}],category:'behavior',scope:'API',classification:'mandatory',dependencies:[],extraction:{harness:'fixture',promptDigest:'assigned-by-coordinator'}}],assessments:[{requirementId:'r',status:'implemented',evidenceIds:['e'],reasoning:'code',gaps:[],confidence:1}],evidence:[{id:'e',kind:'code',description:'implementation',code:{commit:head,path:'value.js',startLine:1}}],findings:[],inspectedPaths:['value.js'],uninspected:[]};
fs.writeFileSync(process.argv[process.argv.indexOf('--output-last-message')+1],JSON.stringify(output));console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:1,output_tokens:1}}));
`, { mode: 0o700 });
  const config = { ...DEFAULT_CONFIG, harness: { adapter: "codex", version: "1", executable: harness }, inference: { provider: "openai", model: "fixture", auth: "api-key", credentialEnv: "REVIEWFN_SMOKE_AUTH" }, context: [{ adapter: "repository-markdown", paths: ["README.md"] }] };
  writeFileSync(path.join(fixture, ".reviewfn/config.json"), JSON.stringify(config));
  writeFileSync(path.join(fixture, ".reviewfn/policy.json"), JSON.stringify({ ...DEFAULT_POLICY, requiredCategories: ["behavior"] }));
  writeFileSync(path.join(fixture, "README.md"), "Return the value\n"); writeFileSync(path.join(fixture, "value.js"), "export const value = 1;\n");
  const git = args => execFileSync(gitExecutable, args, { cwd: fixture, encoding: "utf8" });
  git(["init", "-q"]); git(["remote", "add", "origin", "sensitive-user@github.com:acme/fixture.git"]); git(["add", "."]); git(["-c", "user.name=ReviewFn", "-c", "user.email=reviewfn@example.invalid", "commit", "-qm", "fixture"]);
  const base = git(["rev-parse", "HEAD"]).trim();
  git(["branch", "reviewfn-base", base]);
  writeFileSync(path.join(fixture, "value.js"), "export const value = 2;\n");
  git(["add", "."]); git(["-c", "user.name=ReviewFn", "-c", "user.email=reviewfn@example.invalid", "commit", "-qm", "change value"]);
  const head = git(["rev-parse", "HEAD"]).trim();
  if (!JSON.parse(run(["preflight", "--base", base, "--head", head])).ok) throw new Error("External preflight failed.");
  run(["review", "--base", "reviewfn-base", "--head", head, "--output", "../output"]);
  const reportPath = path.join(consumer, "output/report.json"); const report = JSON.parse(readFileSync(reportPath, "utf8"));
  if (report.change.targetBranch !== "reviewfn-base" || report.verdict !== "ready" || report.change.headCommit !== head || report.requirements.length !== 1 || !report.change.changedPaths.includes("value.js")) throw new Error(`External consumer review failed: ${JSON.stringify(report.coverageReasons)}`);
  if (!run(["render", "--input", reportPath]).includes("Return the value")) throw new Error("External render failed.");
  return { head, verdict: report.verdict, harness: "deterministic fixture, not model-quality evidence", commands: ["init", "preflight", "review", "render"], artifacts: true };
}
