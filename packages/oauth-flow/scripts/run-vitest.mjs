#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const args = process.argv.slice(2).filter((arg) => arg !== "--runInBand");
const vitestArgs = ["vitest", "run", ...args];
const command = process.platform === "win32" ? "npx.cmd" : "npx";

const result = spawnSync(command, vitestArgs, { stdio: "inherit" });
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? (result.signal ? 1 : 0));
