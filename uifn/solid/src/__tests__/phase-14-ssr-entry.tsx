import { generateHydrationScript, renderToString } from 'solid-js/web';
import manifest from '../../../evidence/generated/phase-14/phase-14-public-vectors.json';
import { createPhase14HarnessRuntime } from '../../../parity/src/trace.mjs';
import { createPhase14SolidPublicTree } from './fixtures/phase-14-public-tree.jsx';

export function renderPhase14SolidSsr(): Array<{ primitive: string; body: string }> {
  return manifest.vectors.map((vector) => {
    const runtime = createPhase14HarnessRuntime(vector);
    const body = renderToString(() => createPhase14SolidPublicTree(vector, runtime));
    return { primitive: vector.primitive, body };
  });
}

export function renderPhase14SolidHydrationScript(): string {
  return generateHydrationScript();
}
