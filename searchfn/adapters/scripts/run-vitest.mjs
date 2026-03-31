import { spawnSync } from "node:child_process";
import { delimiter } from "node:path";

const forwarded = process.argv.slice(2).filter((arg) => arg !== "--runInBand");
const binDir = `${process.cwd()}/node_modules/.bin`;
const result = spawnSync(process.platform === "win32" ? "vitest.cmd" : "vitest", forwarded, {
  stdio: "inherit",
  shell: false,
  env: {
    ...process.env,
    PATH: `${binDir}${delimiter}${process.env.PATH ?? ""}`,
  },
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(result.status ?? 1);
