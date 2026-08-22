import { render } from 'svelte/server';
import manifest from './fixtures/phase-14-public-vectors.json';
import { createPhase14HarnessRuntime } from '../../parity/src/trace.mjs';
import Phase14AccordionSsrHarness from './fixtures/Phase14AccordionSsrHarness.svelte';
import Phase14PublicTreeSsrHarness from './fixtures/Phase14PublicTreeSsrHarness.svelte';

export function renderPhase14SvelteSsr(): Array<{ primitive: string; body: string }> {
  return manifest.vectors.map((vector) => {
    const runtime = createPhase14HarnessRuntime(vector);
    const Component = vector.primitive === 'Accordion'
      ? Phase14AccordionSsrHarness
      : Phase14PublicTreeSsrHarness;
    const output = render(Component, {
      props: {
        vector,
        rootProps: runtime.rootProps,
      },
    });
    return { primitive: vector.primitive, body: output.body };
  });
}
