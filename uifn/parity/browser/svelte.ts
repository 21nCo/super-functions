import { mount, tick, unmount } from 'svelte';
import manifest from '../../evidence/generated/phase-14/phase-14-public-vectors.json';
import {
  assemblePhase14Trace,
  capturePhase14Checkpoint,
  capturePhase14Cleanup,
  createPhase14HarnessRuntime,
  runPhase14Actions,
} from '../src/trace.mjs';
import type { SveltePrimitiveBridge } from '../../svelte/lib/internal/compound.js';
import Phase14PublicTreeHarness from '../../svelte/tests/fixtures/Phase14PublicTreeHarness.svelte';
import { assertPhase14Checkpoints, assertUniqueIds, browserTraceEnvironment, removeHarnessDom, settle } from './runtime';

const frameworkVersion = '__UIFN_SVELTE_VERSION__';

export async function runBrowserPublicTrees(): Promise<unknown[]> {
  const traces: unknown[] = [];
  for (const vector of manifest.vectors) {
    const runtime = createPhase14HarnessRuntime(vector);
    runtime.invokeAction = async (action: (...args: unknown[]) => unknown, args: unknown[], shouldAwait: boolean) => {
      const result = action(...args);
      if (shouldAwait || result instanceof Promise) await result;
      await tick();
      await settle();
      await tick();
    };
    let bridge: SveltePrimitiveBridge | undefined;
    const host = document.createElement('div');
    host.dataset.uifnPhase14BrowserHost = vector.id;
    document.body.append(host);
    const mounted = mount(Phase14PublicTreeHarness, {
      target: host,
      props: { vector, rootProps: runtime.rootProps, capture: (next: SveltePrimitiveBridge) => { bridge = next; } },
    });
    await tick();
    await settle();
    await tick();
    if (!bridge) throw new Error(`${vector.primitive} public root did not expose its Svelte bridge in a real browser.`);
    const activeBridge = bridge;
    assertUniqueIds(vector);
    const run = await runPhase14Actions(
      vector,
      activeBridge,
      runtime,
      (checkpoint: string, sequence: number) => capturePhase14Checkpoint(runtime.token, checkpoint, activeBridge, sequence),
    );
    assertPhase14Checkpoints(vector, run.checkpoints);
    await unmount(mounted);
    await tick();
    await settle();
    const cleanup = capturePhase14Cleanup(runtime.token, activeBridge, runtime.scheduler);
    const trace = assemblePhase14Trace({
      vector,
      framework: 'svelte',
      frameworkVersion,
      installMode: 'package',
      runtime,
      run,
      cleanup,
      environment: browserTraceEnvironment(),
    });
    if (trace.result !== 'passed') throw new Error(`${vector.primitive} Svelte browser trace failed: ${JSON.stringify({ actions: trace.actions, errors: trace.errors, cleanup })}`);
    traces.push(trace);
    removeHarnessDom();
  }
  if (traces.length !== manifest.vectors.length) {
    throw new Error(`Svelte browser harness produced ${traces.length}/${manifest.vectors.length} public-tree traces.`);
  }
  return traces;
}
