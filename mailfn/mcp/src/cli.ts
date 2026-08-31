#!/usr/bin/env node
import { MailFnClient } from '@mailfn/client';
import { serveMailFnMcpStdio } from './server.js';

const baseUrl = process.env.MAILFN_URL;
const token = process.env.MAILFN_TOKEN;
if (!baseUrl || !token) {
  process.stderr.write('MAILFN_URL and MAILFN_TOKEN are required\n');
  process.exitCode = 1;
} else {
  serveMailFnMcpStdio(new MailFnClient({ baseUrl, token })).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
