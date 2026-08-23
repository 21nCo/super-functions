import * as React from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import manifest from '../../.conduct/generated/phase-14/phase-14-public-vectors.json';
import {
  assemblePhase14Trace,
  capturePhase14Checkpoint,
  capturePhase14Cleanup,
  createPhase14HarnessRuntime,
  runPhase14Actions,
} from '../src/trace.mjs';
import type { ReactPrimitiveBridge } from '../../react/src/internal/compound';
import { createPhase14ReactPublicTree } from '../../react/src/__tests__/fixtures/phase-14-public-tree';
import { assertPhase14Checkpoints, assertUniqueIds, browserTraceEnvironment, removeHarnessDom, settle } from './runtime';

export async function runBrowserPublicTrees(): Promise<unknown[]> {
  const traces: unknown[] = [];
  for (const vector of manifest.vectors) {
    const runtime = createPhase14HarnessRuntime(vector);
    runtime.invokeAction = async (action: (...args: unknown[]) => unknown, args: unknown[], shouldAwait: boolean) => {
      let result: unknown;
      flushSync(() => { result = action(...args); });
      if (shouldAwait || result instanceof Promise) await result;
      await settle();
    };
    let bridge: ReactPrimitiveBridge | undefined;
    const host = document.createElement('div');
    host.dataset.uifnPhase14BrowserHost = vector.id;
    document.body.append(host);
    const root = createRoot(host);
    flushSync(() => root.render(createPhase14ReactPublicTree(vector, runtime, (next) => { bridge = next; })));
    await settle();
    if (!bridge) throw new Error(`${vector.primitive} public root did not expose its React bridge in a real browser.`);
    const activeBridge = bridge;
    assertUniqueIds(vector);
    const run = await runPhase14Actions(
      vector,
      activeBridge,
      runtime,
      (checkpoint: string, sequence: number) => capturePhase14Checkpoint(runtime.token, checkpoint, activeBridge, sequence),
    );
    assertPhase14Checkpoints(vector, run.checkpoints);
    flushSync(() => root.unmount());
    await settle();
    const cleanup = capturePhase14Cleanup(runtime.token, activeBridge, runtime.scheduler);
    const trace = assemblePhase14Trace({
      vector,
      framework: 'react',
      frameworkVersion: React.version,
      installMode: 'package',
      runtime,
      run,
      cleanup,
      environment: browserTraceEnvironment(),
    });
    if (trace.result !== 'passed') throw new Error(`${vector.primitive} React browser trace failed: ${JSON.stringify({ actions: trace.actions, errors: trace.errors, cleanup })}`);
    traces.push(trace);
    removeHarnessDom();
  }
  if (traces.length !== manifest.vectors.length) {
    throw new Error(`React browser harness produced ${traces.length}/${manifest.vectors.length} public-tree traces.`);
  }
  return traces;
}
