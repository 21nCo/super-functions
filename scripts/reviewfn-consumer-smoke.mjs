import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export async function consumerSmoke(consumer) {
  const { DEFAULT_CONFIG, DEFAULT_POLICY, resolveTrustedExecutable } = await import(pathToFileURL(path.join(consumer, "node_modules/@superfunctions/reviewfn-core/dist/index.js")));
  const gitExecutable = await resolveTrustedExecutable("git");
  const fixture = path.join(consumer, "fixture"); mkdirSync(fixture);
  const binary = path.join(consumer, "node_modules/@superfunctions/reviewfn-cli/dist/main.js");
  const filterConfig = path.join(consumer, "host-filter.config");
  const filterMarker = path.join(consumer, "host-filter-ran");
  const filterScript = path.join(consumer, "host-filter.cjs");
  writeFileSync(filterScript, `require('fs').writeFileSync(${JSON.stringify(filterMarker)}, 'unsafe');process.stdout.write(require('fs').readFileSync(0));`);
  const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
  execFileSync(gitExecutable, ["config", "--file", filterConfig, "filter.reviewfn-fixture.smudge", `${quote(process.execPath)} ${quote(filterScript)}`]);
  execFileSync(gitExecutable, ["config", "--file", filterConfig, "filter.reviewfn-fixture.clean", `${quote(process.execPath)} ${quote(filterScript)}`]);
  execFileSync(gitExecutable, ["config", "--file", filterConfig, "filter.reviewfn-fixture.required", "true"]);
  const run = args => execFileSync(process.execPath, [binary, ...args], { cwd: fixture, encoding: "utf8", timeout: 60_000, env: { ...process.env, GIT_CONFIG_GLOBAL: filterConfig, GITHUB_TOKEN: "", GITHUB_BASE_REF: "unrelated-workflow-base", REVIEWFN_SMOKE_AUTH: "fixture-only-noncredential" } });
  run(["init"]);
  const harness = path.join(consumer, "fixture-codex.cjs");
  writeFileSync(harness, `#!${process.execPath}
const fs=require('fs'),cp=require('child_process');
if(process.argv.includes('--version')){console.log('fixture-codex 1');process.exit(0)}
const head=cp.execFileSync(${JSON.stringify(gitExecutable)},['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const committed=cp.execFileSync(${JSON.stringify(gitExecutable)},['show',head+':value.js']);if(!fs.readFileSync('value.js').equals(committed))process.exit(10);
const remote=cp.execFileSync(${JSON.stringify(gitExecutable)},['config','--get','remote.origin.url'],{encoding:'utf8'});if(remote.includes('sensitive-user'))process.exit(9);
const output={requirements:[{id:'r',statement:'Return the value',sources:[{sourceId:'repo:README.md',anchor:'L1'}],category:'behavior',scope:'API',classification:'mandatory',dependencies:[],extraction:{harness:'fixture',promptDigest:'assigned-by-coordinator'}}],assessments:[{requirementId:'r',status:'implemented',evidenceIds:['e'],reasoning:'code',gaps:[],confidence:1}],evidence:[{id:'e',kind:'code',description:'implementation',code:{commit:head,path:'value.js',startLine:1}}],findings:[],inspectedPaths:['value.js'],uninspected:[]};
fs.writeFileSync(process.argv[process.argv.indexOf('--output-last-message')+1],JSON.stringify(output));console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:1,output_tokens:1}}));
`, { mode: 0o700 });
  const config = { ...DEFAULT_CONFIG, review: { ...DEFAULT_CONFIG.review, categories: ["behavior"] }, harness: { adapter: "codex", version: "1", executable: harness }, inference: { provider: "openai", model: "fixture", auth: "api-key", credentialEnv: "REVIEWFN_SMOKE_AUTH" }, context: [{ adapter: "repository-markdown", paths: ["README.md"] }] };
  writeFileSync(path.join(fixture, ".reviewfn/config.json"), JSON.stringify(config));
  writeFileSync(path.join(fixture, ".reviewfn/policy.json"), JSON.stringify({ ...DEFAULT_POLICY, requiredCategories: ["behavior"] }));
  writeFileSync(path.join(fixture, "README.md"), "Return the value\n"); writeFileSync(path.join(fixture, "value.js"), "export const value = 1;\n");
  writeFileSync(path.join(fixture, ".gitattributes"), "value.js filter=reviewfn-fixture text eol=crlf\n");
  const git = args => execFileSync(gitExecutable, args, { cwd: fixture, encoding: "utf8" });
  git(["init", "-q"]); git(["remote", "add", "origin", "sensitive-user@github.com:acme/fixture.git"]); git(["add", "."]); git(["-c", "user.name=ReviewFn", "-c", "user.email=reviewfn@example.invalid", "commit", "-qm", "fixture"]);
  const base = git(["rev-parse", "HEAD"]).trim();
  git(["branch", "reviewfn-base", base]);
  writeFileSync(path.join(fixture, "value.js"), "export const value = 2;\n");
  git(["add", "."]); git(["-c", "user.name=ReviewFn", "-c", "user.email=reviewfn@example.invalid", "commit", "-qm", "change value"]);
  const head = git(["rev-parse", "HEAD"]).trim();
  if (!JSON.parse(run(["preflight", "--base", base, "--head", head])).ok) throw new Error("External preflight failed.");
  run(["review", "--base", "reviewfn-base", "--head", head, "--output", "../output"]);
  if (existsSync(filterMarker)) throw new Error("Snapshot checkout executed an inherited host Git filter.");
  const reportPath = path.join(consumer, "output/report.json"); const report = JSON.parse(readFileSync(reportPath, "utf8"));
  if (report.change.targetBranch !== "reviewfn-base" || report.verdict !== "ready" || report.change.headCommit !== head || report.requirements.length !== 1 || !report.change.changedPaths.includes("value.js")) throw new Error(`External consumer review failed: ${JSON.stringify(report.coverageReasons)}`);
  if (!run(["render", "--input", reportPath]).includes("Return the value")) throw new Error("External render failed.");
  writeFileSync(path.join(consumer, "output/artifacts/corrupt.json"), "{}");
  let cleanupFailure;
  try { run(["review", "--base", "reviewfn-base", "--head", head, "--output", "../output"]); }
  catch (error) { cleanupFailure = error; }
  if (cleanupFailure?.status !== 1 || !String(cleanupFailure.stderr).includes("REVIEWFN_RETENTION_CLEANUP_FAILED")) throw new Error("External consumer silently ignored retention cleanup failure.");
  if (JSON.parse(readFileSync(reportPath, "utf8")).verdict !== "ready") throw new Error("Cleanup failure lost the completed local report.");
  const { GitSourceControlAdapter } = await import(pathToFileURL(path.join(consumer, "node_modules/@superfunctions/reviewfn-github/dist/index.js")));
  const sourceControl = new GitSourceControlAdapter();
  if (!(await sourceControl.pathExists(fixture, head, "value.js")) || await sourceControl.pathExists(fixture, head, "absent.js")) throw new Error("Installed source adapter misclassified path existence.");
  if (existsSync(filterMarker)) throw new Error("A later ReviewFn run leaked the host filter configuration.");
  execFileSync(gitExecutable, ["cat-file", "--filters", `${head}:value.js`], { cwd: fixture, env: { ...process.env, GIT_CONFIG_GLOBAL: filterConfig } });
  if (!existsSync(filterMarker)) throw new Error("Host-filter regression fixture did not exercise a working external filter.");
  return { head, verdict: report.verdict, harness: "deterministic fixture, not model-quality evidence", commands: ["init", "preflight", "review", "render"], artifacts: true };
}
