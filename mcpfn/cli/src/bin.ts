#!/usr/bin/env node

import { runCli } from "./index.js";

void runCli(process.argv.slice(2))
  .then((exitCode) => {
    if (exitCode !== 0) process.exitCode = exitCode;
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  });
