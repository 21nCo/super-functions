#!/usr/bin/env node

import { runCli } from './cli';

void runCli().then((result) => {
  process.exitCode = result.exitCode;
});
