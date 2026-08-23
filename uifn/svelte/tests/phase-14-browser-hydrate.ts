import { hydrate, tick } from 'svelte';
import manifest from '../../.conduct/generated/phase-14/phase-14-public-vectors.json';
import { createPhase14HarnessRuntime } from '../../parity/src/trace.mjs';
import Phase14AccordionSsrHarness from './fixtures/Phase14AccordionSsrHarness.svelte';
import Phase14PublicTreeSsrHarness from './fixtures/Phase14PublicTreeSsrHarness.svelte';

declare global {
  interface Window {
    __UIFN_PHASE14_RESULT__?: Record<string, unknown>;
  }
}

const descriptor = JSON.parse(document.querySelector('#uifn-phase-14-descriptor')?.textContent ?? '{}') as {
  primitive?: string;
};
window.__UIFN_PHASE14_RESULT__ = { status: 'pending', primitive: descriptor.primitive };
let hydrationHost: HTMLElement | null = null;
let serverMarkup = '';

const warnings: unknown[][] = [];
const errors: unknown[][] = [];
const originalWarn = console.warn;
const originalError = console.error;
console.warn = (...values: unknown[]) => {
  warnings.push(values);
  originalWarn(...values);
};
console.error = (...values: unknown[]) => {
  errors.push(values);
  originalError(...values);
};

try {
  const vector = manifest.vectors.find((candidate) => candidate.primitive === descriptor.primitive);
  if (!vector) throw new Error(`Unknown Phase 14 Svelte primitive ${descriptor.primitive ?? 'missing'}.`);
  const host = document.querySelector<HTMLElement>('#app');
  if (!host) throw new Error('Missing Phase 14 Svelte hydration host.');
  hydrationHost = host;
  serverMarkup = host.innerHTML;
  const runtime = createPhase14HarnessRuntime(vector);
  const props = { vector, rootProps: runtime.rootProps };
  const beforeIds = Array.from(host.querySelectorAll<HTMLElement>('[id]')).map((element) => element.id);
  const beforeParts = host.querySelectorAll('[data-uifn-phase-14-part]').length;
  if (new Set(beforeIds).size !== beforeIds.length) throw new Error(`${vector.primitive} server output contains duplicate IDs.`);
  if (beforeParts !== vector.anatomy.length) {
    throw new Error(`${vector.primitive} server output exposed ${beforeParts}/${vector.anatomy.length} anatomy parts.`);
  }
  const Component = vector.primitive === 'Accordion'
    ? Phase14AccordionSsrHarness
    : Phase14PublicTreeSsrHarness;
  hydrate(Component, { target: host, props, recover: false });
  await tick();
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await tick();
  const afterIds = Array.from(document.querySelectorAll<HTMLElement>('[id]')).map((element) => element.id);
  const afterParts = document.querySelectorAll('[data-uifn-phase-14-part]').length;
  if (warnings.length > 0) throw new Error(`${vector.primitive} hydration emitted ${warnings.length} warning(s).`);
  if (errors.length > 0) throw new Error(`${vector.primitive} hydration emitted ${errors.length} console error(s).`);
  if (new Set(afterIds).size !== afterIds.length) throw new Error(`${vector.primitive} hydrated output contains duplicate IDs.`);
  if (afterParts !== vector.anatomy.length) {
    throw new Error(`${vector.primitive} hydrated output exposed ${afterParts}/${vector.anatomy.length} anatomy parts.`);
  }
  window.__UIFN_PHASE14_RESULT__ = {
    status: 'passed',
    primitive: vector.primitive,
    serverPartCount: beforeParts,
    hydratedPartCount: afterParts,
    serverIdCount: beforeIds.length,
    hydratedIdCount: afterIds.length,
    warningCount: warnings.length,
    errorCount: errors.length,
  };
} catch (cause) {
  window.__UIFN_PHASE14_RESULT__ = {
    status: 'failed',
    primitive: descriptor.primitive,
    message: cause instanceof Error ? cause.message : String(cause),
    stack: cause instanceof Error ? cause.stack : undefined,
    serverMarkup,
    clientMarkup: hydrationHost?.innerHTML ?? '',
    warnings: warnings.map((values) => values.map(String)),
    errors: errors.map((values) => values.map(String)),
    warningCount: warnings.length,
    errorCount: errors.length,
  };
}
