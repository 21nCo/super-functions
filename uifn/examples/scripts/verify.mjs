import { spawnSync } from "node:child_process";
import path from "node:path";

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..", "..");
const result = spawnSync(process.execPath, ["scripts/verify-uifn-examples.mjs", ...process.argv.slice(2)], {
  cwd: rootDir,
  stdio: "inherit",
});

process.exit(result.status ?? 1);
