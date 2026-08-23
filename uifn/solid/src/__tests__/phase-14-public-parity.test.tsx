import { writeFile } from 'node:fs/promises';
import { render } from 'solid-js/web';
import { afterEach, describe, expect, it } from 'vitest';
import manifest from '../../../.conduct/generated/phase-14/phase-14-public-vectors.json';
import {
  assemblePhase14Trace,
  capturePhase14Checkpoint,
  capturePhase14Cleanup,
  createPhase14HarnessRuntime,
  runPhase14Actions,
} from '../../../parity/src/trace.mjs';
import type { SolidPrimitiveBridge } from '../internal/compound.jsx';
import { createPhase14SolidPublicTree } from './fixtures/phase-14-public-tree.jsx';

const disposers: Array<() => void> = [];

async function settle(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
}

afterEach(() => {
  while (disposers.length) disposers.pop()?.();
  document.body.innerHTML = '';
});

describe('TV-PARITY-001-P: actual Solid public compound traces', () => {
  it('mounts, operates, traces, and cleans every catalog public tree', async () => {
    expect(manifest.primitiveCount).toBe(69);
    expect(manifest.anatomyCount).toBe(465);
    const traces: unknown[] = [];

    for (const vector of manifest.vectors) {
      const runtime = createPhase14HarnessRuntime(vector);
      runtime.invokeAction = async (action: (...args: unknown[]) => unknown, args: unknown[], shouldAwait: boolean) => {
        const result = action(...args);
        if (shouldAwait || result instanceof Promise) await result;
        await settle();
      };
      let bridge: SolidPrimitiveBridge | undefined;
      const host = document.createElement('div');
      document.body.append(host);
      const dispose = render(() => createPhase14SolidPublicTree(vector, runtime, (next) => { bridge = next; }), host);
      await settle();
      expect(bridge, `${vector.primitive} public root did not expose its actual bridge`).toBeTruthy();
      const activeBridge = bridge!;
      const run = await runPhase14Actions(
        vector,
        activeBridge,
        runtime,
        (checkpoint: string, sequence: number) => capturePhase14Checkpoint(runtime.token, checkpoint, activeBridge, sequence),
      );
      for (const checkpoint of run.checkpoints) {
        expect(
          checkpoint.parts.parts.map((part: { part: string }) => part.part).sort(),
          `${vector.primitive}:${checkpoint.parts.checkpoint}`,
        ).toEqual(vector.anatomy.map((part) => part.id).sort());
      }
      dispose();
      await settle();
      const cleanup = capturePhase14Cleanup(runtime.token, activeBridge, runtime.scheduler);
      const trace = assemblePhase14Trace({
        vector,
        framework: 'solid',
        frameworkVersion: '1.9.13',
        installMode: (process.env.UIFN_PHASE14_INSTALL_MODE ?? 'source') as 'package' | 'source',
        runtime,
        run,
        cleanup,
      });
      expect(trace.result, `${vector.primitive}:${JSON.stringify({ actions: trace.actions, errors: trace.errors, cleanup })}`).toBe('passed');
      traces.push(trace);
      host.remove();
      document.body.innerHTML = '';
    }

    const output = process.env.UIFN_PHASE14_TRACE_OUT;
    if (output) await writeFile(output, `${JSON.stringify(traces, null, 2)}\n`);
    expect(traces).toHaveLength(manifest.vectors.length);
  }, 120_000);
});
