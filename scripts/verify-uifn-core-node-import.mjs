#!/usr/bin/env node

import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

for (const name of ['document', 'window']) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    get() {
      throw new Error(`UIFN_CORE_BROWSER_GLOBAL:${name}`);
    },
  });
}

const core = await import(pathToFileURL(resolve('uifn/core/dist/index.mjs')).href);
const firstAvatar = core.AvatarContract.getParts(
  { alt: 'Node import smoke avatar' },
  { scopeId: 'node-import' }
);
const secondAvatar = core.AvatarContract.getParts(
  { alt: 'Node import smoke avatar' },
  { scopeId: 'node-import' }
);

const toast = core.createToastController({
  toasts: [{ id: 'node-import-toast', title: 'Node import smoke', duration: Infinity }],
});
toast.actions.pause('node-import');
toast.actions.resume('node-import');
toast.destroy();

const result = {
  ok:
    firstAvatar.image.attributes.alt === 'Node import smoke avatar'
    && JSON.stringify(firstAvatar) === JSON.stringify(secondAvatar)
    && toast.state.visible.length === 1,
  node: process.version,
  domGlobals: 'throw-on-read',
  interactions: 2,
  staticContracts: 1,
};
console[result.ok ? 'log' : 'error'](JSON.stringify(result));
process.exit(result.ok ? 0 : 1);
