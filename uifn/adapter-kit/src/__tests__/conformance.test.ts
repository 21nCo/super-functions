import { describe, expect, it } from 'vitest';
import {
  assertSemanticParity,
  compareSemanticTraces,
  normalizeSemanticTrace,
  runSemanticParity,
  validateSemanticTrace,
  type AdapterFramework,
  type SemanticTrace,
} from '../conformance';

function trace(framework: AdapterFramework, overrides: Partial<SemanticTrace> = {}): SemanticTrace {
  return {
    schemaVersion: 1,
    primitive: 'example-primitive',
    framework,
    installMode: 'package',
    vectorId: 'EXAMPLE-PUBLIC-001',
    environment: {
      runtime: 'node',
      runtimeVersion: 'v22.0.0',
      frameworkVersion: framework === 'react' ? '19.0.0' : '1.0.0',
      browser: 'chromium',
      browserVersion: '1',
      os: 'test',
      direction: 'ltr',
      locale: 'en-US',
      timeZone: 'UTC',
    },
    steps: [{ sequence: 1, kind: 'event', name: 'click', part: 'trigger', currentTarget: 'button' }],
    transactions: [{ sequence: 1, version: 42, status: 'running', state: { open: true }, changedKeys: ['open'] }],
    actions: [{ sequence: 1, name: 'open', arguments: [], observed: true }],
    parts: [{
      checkpoint: 'after',
      parts: [{
        part: 'trigger',
        tag: 'button',
        id: `${framework}-trigger-19`,
        role: 'button',
        tabIndex: 0,
        hidden: false,
        disabled: false,
        aria: { controls: `${framework}-content-19`, expanded: true },
        data: { state: 'open' },
        attributes: {},
      }, {
        part: 'content',
        tag: 'div',
        id: `${framework}-content-19`,
        hidden: false,
        disabled: false,
        aria: { labelledby: `${framework}-trigger-19` },
        data: { state: 'open' },
        attributes: {},
      }],
    }],
    dom: [{ checkpoint: 'after', rootConnected: true, semanticNodeCount: 2, formValues: {} }],
    focus: [{ sequence: 1, checkpoint: 'after', part: 'content', tag: 'div' }],
    callbacks: [{ sequence: 1, name: 'onOpenChange', arguments: [true] }],
    errors: [],
    cleanup: {
      controllerDestroyed: true,
      domReleased: true,
      subscriptions: 0,
      listeners: 0,
      observers: 0,
      timers: 0,
      frames: 0,
      portals: 0,
      layers: 0,
      locks: 0,
      inertRoots: 0,
      childServices: 0,
      connectedSemanticNodes: 0,
    },
    result: 'passed',
    ...overrides,
  };
}

describe('lossless public-tree semantic traces', () => {
  it('normalizes only framework nondeterminism while preserving ID relationships', () => {
    const react = normalizeSemanticTrace(trace('react'));
    const solid = normalizeSemanticTrace(trace('solid', {
      transactions: [{ sequence: 9, version: 5_003, status: 'running', state: { open: true }, changedKeys: ['open'] }],
    }));
    expect(react).toEqual(solid);
    expect(react.parts[0].parts[0].id).toBe('id-2');
    expect(react.parts[0].parts[0].aria.controls).toBe('id-1');
    expect(react.parts[0].parts[1].id).toBe('id-1');
    expect(react.parts[0].parts[1].aria.labelledby).toBe('id-2');
  });

  it('compares React, Svelte, and Solid against one reviewed golden', () => {
    const golden = trace('react');
    const result = runSemanticParity({
      golden: [golden],
      traces: [trace('react'), trace('svelte'), trace('solid')],
    });
    expect(assertSemanticParity(result).ok).toBe(true);
    expect(result.compared).toBe(3);
    expect(result.frameworksPassed).toEqual(['react', 'svelte', 'solid']);
  });

  it('does not normalize away callback ordering', () => {
    const expected = trace('react', {
      callbacks: [
        { sequence: 1, name: 'onOpenChange', arguments: [true] },
        { sequence: 2, name: 'onAfterOpen', arguments: [] },
      ],
    });
    const actual = trace('svelte', {
      callbacks: [
        { sequence: 1, name: 'onAfterOpen', arguments: [] },
        { sequence: 2, name: 'onOpenChange', arguments: [true] },
      ],
    });
    const result = compareSemanticTraces(expected, actual);
    expect(result.ok).toBe(false);
    expect(result.issues[0]).toMatchObject({
      code: 'UIFN_SEMANTIC_TRACE_DIVERGED',
      path: '/callbacks/0/arguments/length',
    });
  });

  it.each([
    ['Solid ARIA', 'solid', { parts: [{ checkpoint: 'after', parts: [] }] }, '/parts/0/parts/length'],
    ['React focus return', 'react', { focus: [{ sequence: 1, checkpoint: 'after', part: 'trigger', tag: 'button' }] }, '/focus/0/part'],
    ['Svelte cleanup', 'svelte', { cleanup: { ...trace('svelte').cleanup, listeners: 1 } }, '/cleanup/listeners'],
  ] as const)('reports the precise field for %s mutations', (_name, framework, mutation, path) => {
    const result = compareSemanticTraces(trace('react'), trace(framework, mutation as Partial<SemanticTrace>));
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.path === path)).toBe(true);
  });

  it('fails closed for incomplete channels and missing framework traces', () => {
    const incomplete = { ...trace('react') } as Record<string, unknown>;
    delete incomplete.focus;
    expect(validateSemanticTrace(incomplete)).toContainEqual(expect.objectContaining({
      code: 'UIFN_TRACE_SCHEMA_INCOMPLETE',
      path: '/focus',
    }));

    const result = runSemanticParity({ golden: [trace('react')], traces: [trace('react')] });
    expect(result.issues.map((issue) => issue.code)).toEqual([
      'UIFN_PARITY_FRAMEWORK_MISSING',
      'UIFN_PARITY_FRAMEWORK_MISSING',
    ]);
    expect(() => assertSemanticParity(result)).toThrow(/UIFN_PARITY_FRAMEWORK_MISSING/);
  });

  it('rejects incomplete nested evidence, invalid counters, and unknown results', () => {
    const malformed = {
      ...trace('react'),
      environment: {},
      actions: [{}],
      cleanup: { controllerDestroyed: true, listeners: -1 },
      result: 'skipped',
    };
    const paths = validateSemanticTrace(malformed).map((issue) => issue.path);
    expect(paths).toEqual(expect.arrayContaining([
      '/result',
      '/environment/runtime',
      '/environment/direction',
      '/actions/0/sequence',
      '/actions/0/observed',
      '/cleanup/domReleased',
      '/cleanup/listeners',
    ]));
  });
});
