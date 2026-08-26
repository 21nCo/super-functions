import { writeFile } from 'node:fs/promises';
import * as React from 'react';
import { act, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import manifest from '../../../evidence/generated/phase-14/phase-14-public-vectors.json';
import {
  assemblePhase14Trace,
  capturePhase14Checkpoint,
  capturePhase14Cleanup,
  createPhase14HarnessRuntime,
  runPhase14Actions,
} from '../../../parity/src/trace.mjs';
import type { ReactPrimitiveBridge } from '../internal/compound';
import { createPhase14ReactPublicTree } from './fixtures/phase-14-public-tree';

describe('TV-PARITY-001-P: actual React public compound traces', () => {
  it('mounts, operates, traces, and cleans every catalog public tree', async () => {
    expect(manifest.primitiveCount).toBe(69);
    expect(manifest.anatomyCount).toBe(465);
    const traces: unknown[] = [];
    let currentPrimitive = 'unstarted';

    try {
      for (const vector of manifest.vectors) {
      currentPrimitive = vector.primitive;
      const runtime = createPhase14HarnessRuntime(vector);
      runtime.invokeAction = async (action: (...args: unknown[]) => unknown, args: unknown[], shouldAwait: boolean) => {
        await act(async () => {
          const result = action(...args);
          if (shouldAwait || result instanceof Promise) await result;
          await new Promise((resolve) => setTimeout(resolve, 0));
        });
      };
      let bridge: ReactPrimitiveBridge | undefined;
      const tree = createPhase14ReactPublicTree(vector, runtime, (next) => { bridge = next; });
      const mounted = render(
        process.env.UIFN_PHASE14_REACT_STRICT === '1'
          ? <React.StrictMode>{tree}</React.StrictMode>
          : tree,
      );
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
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
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
      const cleanup = capturePhase14Cleanup(runtime.token, activeBridge, runtime.scheduler);
      const trace = assemblePhase14Trace({
        vector,
        framework: 'react',
        frameworkVersion: React.version,
        installMode: (process.env.UIFN_PHASE14_INSTALL_MODE ?? 'source') as 'package' | 'source',
        runtime,
        run,
        cleanup,
      });
      expect(trace.result, `${vector.primitive}:${JSON.stringify({ actions: trace.actions, errors: trace.errors, cleanup })}`).toBe('passed');
      traces.push(trace);
      document.body.innerHTML = '';
      }
    } catch (error) {
      throw new Error(`Phase 14 React public vector failed for ${currentPrimitive}.`, { cause: error });
    }

    const output = process.env.UIFN_PHASE14_TRACE_OUT;
    if (output) await writeFile(output, `${JSON.stringify(traces, null, 2)}\n`);
    expect(traces).toHaveLength(manifest.vectors.length);
  }, 120_000);
});
