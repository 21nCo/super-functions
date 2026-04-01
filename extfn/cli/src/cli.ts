#!/usr/bin/env node
import { createExtfnCli } from './index.js';

await createExtfnCli().parseAsync(process.argv);
