import { writeFile } from 'node:fs/promises';
import * as React from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import manifest from '../../../.conduct/generated/phase-14/phase-14-public-vectors.json';
import { createPhase14HarnessRuntime } from '../../../parity/src/trace.mjs';
import type { ReactPrimitiveBridge } from '../internal/compound';
import { createPhase14ReactPublicTree } from './fixtures/phase-14-public-tree';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('TV-REACT-001-P: packed all-compound SSR and hydration', () => {
  it('server-renders and hydrates every public compound without mismatch or duplicate IDs', async () => {
    expect(manifest.primitiveCount).toBe(69);
    const observations: Array<Record<string, unknown>> = [];
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      for (const vector of manifest.vectors) {
        const runtime = createPhase14HarnessRuntime(vector);
        let bridge: ReactPrimitiveBridge | undefined;
        const tree = createPhase14ReactPublicTree(vector, runtime, (next) => { bridge = next; });
        const errorStart = consoleError.mock.calls.length;
        const html = renderToString(tree);
        const host = document.createElement('div');
        host.innerHTML = html;
        document.body.append(host);
        const beforeIds = Array.from(host.querySelectorAll<HTMLElement>('[id]')).map((element) => element.id);
        expect(new Set(beforeIds).size, `${vector.primitive} server IDs`).toBe(beforeIds.length);
        let root: ReturnType<typeof hydrateRoot> | undefined;
        await React.act(async () => {
          root = hydrateRoot(host, tree);
          await Promise.resolve();
          await new Promise((resolve) => setTimeout(resolve, 0));
        });
        const renderErrors = consoleError.mock.calls.slice(errorStart);
        expect(renderErrors, `${vector.primitive} SSR/hydration warnings`).toHaveLength(0);
        expect(bridge, `${vector.primitive} hydrated bridge`).toBeTruthy();
        const afterIds = Array.from(host.querySelectorAll<HTMLElement>('[id]')).map((element) => element.id);
        expect(new Set(afterIds).size, `${vector.primitive} hydrated IDs`).toBe(afterIds.length);
        await React.act(async () => {
          root?.unmount();
          await Promise.resolve();
        });
        host.remove();
        document.body.innerHTML = '';
        observations.push({ primitive: vector.primitive, framework: 'react', frameworkVersion: React.version, installMode: process.env.UIFN_PHASE14_INSTALL_MODE ?? 'source', result: 'passed' });
      }
    } finally {
      consoleError.mockRestore();
    }
    const output = process.env.UIFN_PHASE14_TRACE_OUT;
    if (output) await writeFile(output, `${JSON.stringify(observations, null, 2)}\n`);
    expect(observations).toHaveLength(manifest.vectors.length);
  }, 120_000);
});
