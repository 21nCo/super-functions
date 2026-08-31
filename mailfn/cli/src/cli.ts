#!/usr/bin/env node
import { runMailFnCli } from './index.js';

runMailFnCli().then((code) => { process.exitCode = code; }).catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
