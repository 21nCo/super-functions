#!/usr/bin/env node

import { runCli } from "./index.js";

void (async () => {
  const code = await runCli(process.argv.slice(2));
  if (code !== 0) {
    process.exitCode = code;
  }
})();
