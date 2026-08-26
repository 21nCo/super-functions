import { writeFile } from 'node:fs/promises';
import { cleanup, render as renderClient } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
import manifest from '../../evidence/generated/phase-14/phase-14-public-vectors.json';
import {
  assemblePhase14Trace,
  capturePhase14Checkpoint,
  capturePhase14Cleanup,
  createPhase14HarnessRuntime,
  runPhase14Actions,
} from '../../parity/src/trace.mjs';
import Phase14PublicTreeHarness from './fixtures/Phase14PublicTreeHarness.svelte';
import type { SveltePrimitiveBridge } from '../lib/internal/compound.js';

afterEach(() => cleanup());

async function settleSvelteDom(): Promise<void> {
  await tick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const nextFrame = () => new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
  // Popup DOM ownership deliberately reapplies positioning one frame after
  // Svelte commits controller-driven spread props. Capture only after that
  // production lifecycle has settled.
  await nextFrame();
  await nextFrame();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await tick();
}

describe('TV-PARITY-001-P: actual Svelte public compound traces', () => {
  it('mounts, operates, traces, and cleans every catalog public tree', async () => {
    expect(manifest.primitiveCount).toBe(69);
    expect(manifest.anatomyCount).toBe(465);
    const traces: unknown[] = [];

    for (const vector of manifest.vectors) {
      const runtime = createPhase14HarnessRuntime(vector);
      runtime.invokeAction = async (action: (...args: unknown[]) => unknown, args: unknown[], shouldAwait: boolean) => {
        const result = action(...args);
        if (shouldAwait || result instanceof Promise) await result;
        await settleSvelteDom();
      };
      let bridge: SveltePrimitiveBridge | undefined;
      const mounted = renderClient(Phase14PublicTreeHarness, {
        props: { vector, rootProps: runtime.rootProps, capture: (next: SveltePrimitiveBridge) => { bridge = next; } },
      });
      await settleSvelteDom();
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
      mounted.unmount();
      await settleSvelteDom();
      const cleanupResult = capturePhase14Cleanup(runtime.token, activeBridge, runtime.scheduler);
      const trace = assemblePhase14Trace({
        vector,
        framework: 'svelte',
        frameworkVersion: '5.46.1',
        installMode: (process.env.UIFN_PHASE14_INSTALL_MODE ?? 'source') as 'package' | 'source',
        runtime,
        run,
        cleanup: cleanupResult,
      });
      expect(trace.result, `${vector.primitive}:${JSON.stringify({ actions: trace.actions, errors: trace.errors, cleanup: cleanupResult })}`).toBe('passed');
      traces.push(trace);
      document.body.innerHTML = '';
    }

    const output = process.env.UIFN_PHASE14_TRACE_OUT;
    if (output) await writeFile(output, `${JSON.stringify(traces, null, 2)}\n`);
    expect(traces).toHaveLength(manifest.vectors.length);
  }, 120_000);
});
