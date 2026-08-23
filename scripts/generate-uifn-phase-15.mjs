#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStyledDelivery, materializeOutputs } from './uifn-delivery-generator.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv.includes('--write') ? 'write' : 'check';
const delivery = createStyledDelivery(root);
const failures = materializeOutputs(root, delivery.outputs, {
  mode,
  errorCode: 'UIFN_PHASE15_GENERATED_DRIFT',
  managedRoots: [
    'uifn/components-react/src/generated',
    'uifn/components-solid/src/generated',
    'uifn/components-svelte/src/generated',
  ],
});

if (failures.length) {
  console.error(JSON.stringify({ ok: false, command: 'generate:uifn-phase-15:check', failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    ok: true,
    command: mode === 'write' ? 'generate:uifn-phase-15' : 'generate:uifn-phase-15:check',
    componentCount: delivery.componentCount,
    partCount: delivery.partCount,
  }, null, 2));
}
