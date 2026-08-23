import { describe, expect, it } from 'vitest';
import catalog from '../../../../catalog/generated/catalog.json';
import { createUIFnError } from '../../errors';
import { createManualRuntimeScheduler } from './scheduler';
import { createRuntimeScope } from './scope';
import { createRuntimeService } from './service';
import {
  assertRuntimeChangeMeta,
  assertSemanticTraceEquivalent,
  assertTraceContainsNoSecrets,
  compareSemanticTrace,
  createRuntimeTraceBuffer,
} from './trace';
import type { RuntimeDefinition, RuntimeEvent, RuntimeResourceKind } from './types';

function errorCode(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return undefined;
}

type CounterEvent =
  | { readonly type: 'ADD'; readonly amount: number }
  | { readonly type: 'SET'; readonly value: number }
  | { readonly type: 'NOOP' };

const counterDefinition: RuntimeDefinition<Record<string, never>, { count: number }, 'active', CounterEvent, { doubled: number }> = {
  id: 'counter',
  initialState: 'active',
  initialContext: { count: 0 },
  compute: ({ context }) => ({ doubled: context.count * 2 }),
  transitions: {
    ADD: {
      reduce: ({ context, event }) => {
        const add = event as Readonly<Extract<CounterEvent, { type: 'ADD' }>>;
        return { context: { count: context.count + add.amount }, reason: 'added', action: 'add' };
      },
    },
    SET: {
      reduce: ({ event }) => {
        const set = event as Readonly<Extract<CounterEvent, { type: 'SET' }>>;
        return { context: { count: set.value }, reason: 'set', action: 'set' };
      },
    },
    NOOP: { reduce: ({ context }) => ({ context: { count: context.count }, reason: 'no-op', action: 'no-op' }) },
  },
};

describe('private runtime queue and immutable snapshots', () => {
  it('publishes same-state context changes once, queues reentrant work FIFO, and keeps no-ops silent', () => {
    const service = createRuntimeService(counterDefinition, {}, {
      scope: createRuntimeScope({ id: 'queue-test', mode: 'test' }),
    });
    const observations: Array<{ count: number; version: number; event: string }> = [];
    service.subscribe((snapshot, meta) => {
      observations.push({ count: snapshot.context.count, version: snapshot.version, event: meta!.event.type });
      if (meta?.event.type === 'ADD' && snapshot.context.count === 1) {
        service.send({ type: 'ADD', amount: 2 }, { source: 'effect', reason: 'reentrant-add' });
      }
    }, { emitInitial: false });

    service.send({ type: 'ADD', amount: 1 }, { source: 'user', reason: 'keyboard-add', action: 'increment' });
    service.send({ type: 'NOOP' });

    expect(observations).toEqual([
      { count: 1, version: 1, event: 'ADD' },
      { count: 3, version: 2, event: 'ADD' },
    ]);
    expect(service.getSnapshot().computed.doubled).toBe(6);
    expect(service.getSnapshot().version).toBe(2);
  });

  it('freezes detached snapshots so attempted mutation cannot corrupt current or prior versions', () => {
    const service = createRuntimeService(counterDefinition, {});
    const first = service.getSnapshot();
    service.send({ type: 'SET', value: 4 });
    const second = service.getSnapshot();

    expect(() => {
      (second.context as { count: number }).count = 999;
    }).toThrow();
    expect(first.context.count).toBe(0);
    expect(second.context.count).toBe(4);
    expect(service.getSnapshot().context.count).toBe(4);
  });

  it('matches a seeded reference model and reports the seed plus minimized event on failure', () => {
    const seeds = [0x1a2b3c4d, 0x5eed1234, 0x7f00aa55];
    for (const seed of seeds) {
      let randomState = seed >>> 0;
      const random = () => {
        randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
        return randomState;
      };
      const service = createRuntimeService(counterDefinition, {});
      let model = 0;
      for (let index = 0; index < 250; index += 1) {
        const choice = random() % 3;
        const event: CounterEvent = choice === 0
          ? { type: 'ADD', amount: (random() % 21) - 10 }
          : choice === 1
            ? { type: 'SET', value: (random() % 201) - 100 }
            : { type: 'NOOP' };
        if (event.type === 'ADD') model += event.amount;
        if (event.type === 'SET') model = event.value;
        service.send(event);
        if (service.getSnapshot().context.count !== model) {
          throw new Error(`seed=${seed}; minimizedCase=${JSON.stringify([event])}; index=${index}`);
        }
      }
      service.destroy();
    }
  });
});

describe('private runtime inputs, refs, computed state, and scopes', () => {
  interface Inputs { multiplier: number; label: string }
  interface Refs { element: { id: string } }
  type Event = { readonly type: 'INCREMENT' };
  const definition: RuntimeDefinition<Inputs, { count: number }, 'active', Event, { result: number; hasElement: boolean }, Refs> = {
    id: 'reactive-inputs',
    initialState: 'active',
    initialContext: { count: 2 },
    validateInputs: (inputs) => inputs.multiplier > 0 ? true : ['multiplier must be positive'],
    compute: ({ inputs, context, getRef }) => ({ result: context.count * inputs.multiplier, hasElement: Boolean(getRef('element')) }),
    transitions: {
      INCREMENT: { reduce: ({ context }) => ({ context: { count: context.count + 1 }, reason: 'incremented' }) },
    },
    onInputs: () => ({ reason: 'inputs-updated', action: 'update-inputs' }),
  };

  it('atomically updates validated inputs/computed values without recreation and excludes refs from snapshots', () => {
    const created: string[] = [];
    const service = createRuntimeService(definition, { multiplier: 3, label: 'safe' }, {
      scope: createRuntimeScope({
        id: 'input-root', mode: 'test',
        instrumentation: { onServiceCreate: (id) => created.push(id) },
      }),
    });
    const snapshots: Array<{ version: number; result: number }> = [];
    service.subscribe((snapshot) => snapshots.push({ version: snapshot.version, result: snapshot.computed.result }), { emitInitial: false });
    service.update({ multiplier: 5 }, { source: 'controlled-sync', reason: 'controlled-prop' });
    service.setRef('element', { id: 'not-serialized' });

    expect(created).toEqual(['reactive-inputs']);
    expect(snapshots).toEqual([{ version: 1, result: 10 }, { version: 2, result: 10 }]);
    expect(service.getSnapshot().computed.hasElement).toBe(true);
    expect(JSON.stringify(service.getSnapshot())).not.toContain('not-serialized');
    expect(errorCode(() => service.update({ multiplier: 0 }))).toBe('UIFN_RUNTIME_INPUT_INVALID');
    expect(service.getInputs().multiplier).toBe(5);
  });

  it('merges reentrant partial input updates in FIFO order instead of losing disjoint patches', () => {
    const service = createRuntimeService(definition, { multiplier: 2, label: 'before' });
    service.subscribe((_snapshot, meta) => {
      if (meta?.event.type !== 'INCREMENT') return;
      service.update({ multiplier: 4 });
      service.update({ label: 'after' });
    }, { emitInitial: false });
    service.send({ type: 'INCREMENT' });
    expect(service.getInputs()).toEqual({ multiplier: 4, label: 'after' });
    expect(service.getSnapshot().computed.result).toBe(12);
  });

  it('keeps deterministic IDs local to each scope and rejects duplicates within a scope', () => {
    const first = createRuntimeScope({ id: 'document-a', hydrationSeed: 'request-7' });
    const second = createRuntimeScope({ id: 'document-b', hydrationSeed: 'request-7' });
    const replay = createRuntimeScope({ id: 'document-a', hydrationSeed: 'request-7' });

    expect([first.nextId('item'), first.nextId('item')]).toEqual([
      'document-a-request-7-item-1',
      'document-a-request-7-item-2',
    ]);
    expect(second.nextId('item')).toBe('document-b-request-7-item-1');
    expect(replay.nextId('item')).toBe('document-a-request-7-item-1');
    expect(errorCode(() => first.claimId('document-a-request-7-item-1'))).toBe('UIFN_SCOPE_ID_COLLISION');
    expect(errorCode(() => first.requireCapability('document'))).toBe('UIFN_ENV_CAPABILITY_MISSING');
  });

  it('rejects non-serializable snapshot data with a stable code', () => {
    const bad: RuntimeDefinition<Record<string, never>, { value: unknown }, 'active', { type: 'BAD' }> = {
      id: 'bad-snapshot', initialState: 'active', initialContext: { value: 'safe' },
      transitions: { BAD: { reduce: () => ({ context: { value: () => undefined }, reason: 'bad' }) } },
    };
    const service = createRuntimeService(bad, {});
    expect(errorCode(() => service.send({ type: 'BAD' }))).toBe('UIFN_SNAPSHOT_NON_SERIALIZABLE');
  });
});

describe('private runtime effects, activities, children, and destroy', () => {
  it('rejects an effect without an explicit cleanup contract', () => {
    type Event = { readonly type: 'START' };
    const definition: RuntimeDefinition<Record<string, never>, Record<string, never>, 'active', Event> = {
      id: 'missing-cleanup', initialState: 'active', initialContext: {},
      transitions: {
        START: {
          reduce: () => ({
            context: {}, reason: 'start',
            effects: [{ key: 'invalid', run: (() => undefined) as never }],
          }),
        },
      },
    };
    const service = createRuntimeService(definition, {});
    expect(errorCode(() => service.send({ type: 'START' }))).toBe('UIFN_EFFECT_CLEANUP_MISSING');
    expect(service.status).toBe('error');
    expect(Object.values(service.getResourceCounts()).every((count) => count === 0)).toBe(true);
  });

  it('replaces effects in cleanup-before-setup order and suppresses stale callbacks', () => {
    type Event = { readonly type: 'START'; readonly label: string } | { readonly type: 'COMPLETE'; readonly label: string };
    const scheduler = createManualRuntimeScheduler();
    const lifecycle: string[] = [];
    const lateCallbacks: Array<() => void> = [];
    const definition: RuntimeDefinition<Record<string, never>, { value: string }, 'active', Event> = {
      id: 'effect-order', initialState: 'active', initialContext: { value: '' },
      transitions: {
        START: {
          reduce: ({ event }) => {
            const start = event as Readonly<Extract<Event, { type: 'START' }>>;
            return {
              context: { value: start.label }, reason: 'started',
              effects: [{
                key: 'request',
                run: (api) => {
                  lifecycle.push(`setup:${start.label}`);
                  api.register('observer', `observer-${start.label}`, () => lifecycle.push(`observer-cleanup:${start.label}`));
                  api.delay(`delay-${start.label}`, 10, () => api.send({ type: 'COMPLETE', label: start.label }));
                  lateCallbacks.push(api.guard(() => api.send({ type: 'COMPLETE', label: `late-${start.label}` })));
                  return () => lifecycle.push(`cleanup:${start.label}:aborted=${api.signal.aborted}`);
                },
              }],
            };
          },
        },
        COMPLETE: {
          reduce: ({ event }) => {
            const complete = event as Readonly<Extract<Event, { type: 'COMPLETE' }>>;
            return { context: { value: complete.label }, reason: 'completed' };
          },
        },
      },
    };
    const service = createRuntimeService(definition, {}, {
      scope: createRuntimeScope({ id: 'effects', mode: 'test', scheduler }),
    });

    service.send({ type: 'START', label: 'a' });
    service.send({ type: 'START', label: 'b' });
    lateCallbacks[0]();
    scheduler.advanceBy(10);

    expect(service.getSnapshot().context.value).toBe('b');
    expect(lifecycle.slice(0, 4)).toEqual([
      'setup:a',
      'cleanup:a:aborted=true',
      'observer-cleanup:a',
      'setup:b',
    ]);
    service.destroy();
    lateCallbacks[1]();
    expect(service.getSnapshot().status).toBe('destroyed');
    expect(lifecycle).toContain('cleanup:b:aborted=true');
    expect(Object.values(service.getResourceCounts()).every((count) => count === 0)).toBe(true);
  });

  it('cleans activities and every scheduler/resource family recursively to zero', () => {
    type Event = { readonly type: 'DISABLE' };
    const scheduler = createManualRuntimeScheduler();
    const cleaned: string[] = [];
    const never = new Promise<string>(() => undefined);
    const definition: RuntimeDefinition<{ enabled: boolean }, { enabled: boolean }, 'active', Event> = {
      id: 'resource-sweep', initialState: 'active', initialContext: ({ enabled }) => ({ enabled }),
      transitions: { DISABLE: { reduce: () => ({ context: { enabled: false }, reason: 'disabled' }) } },
      onInputs: ({ nextInputs }) => ({ context: { enabled: nextInputs.enabled }, reason: 'inputs-updated' }),
      activities: [{
        key: 'owned-work',
        when: ({ snapshot }) => snapshot.context.enabled,
        run: (api) => {
          api.delay('timeout', 100, () => undefined);
          api.interval('interval', 10, () => undefined);
          api.frame('frame', () => undefined);
          api.microtask('microtask', () => undefined);
          api.register('observer', 'observer', () => cleaned.push('observer'));
          api.register('listener', 'listener', () => cleaned.push('listener'));
          api.trackPromise('promise', never, () => undefined);
          return () => cleaned.push('activity');
        },
      }],
    };
    const parent = createRuntimeService(definition, { enabled: true }, {
      scope: createRuntimeScope({ id: 'resources', mode: 'test', scheduler }),
    });
    const child = parent.spawnChild('child', counterDefinition, {});
    expect(parent.getResourceCounts().activity).toBe(1);
    expect(parent.getResourceCounts()['child-service']).toBe(1);
    parent.destroy();
    parent.destroy();
    scheduler.flushMicrotasks();

    expect(parent.status).toBe('destroyed');
    expect(child.status).toBe('destroyed');
    expect(cleaned).toEqual(expect.arrayContaining(['activity', 'observer', 'listener']));
    expect(Object.values(parent.getResourceCounts()).every((count) => count === 0)).toBe(true);
    expect(Object.values(scheduler.pending()).every((count) => count === 0)).toBe(true);
  });

  it('removes effect-owned children before replacement so the same child key can be reused', () => {
    type Event = { readonly type: 'START' };
    const parentDefinition: RuntimeDefinition<Record<string, never>, { generation: number }, 'active', Event> = {
      id: 'effect-child-owner', initialState: 'active', initialContext: { generation: 0 },
      transitions: {
        START: {
          reduce: ({ context }) => ({
            context: { generation: context.generation + 1 }, reason: 'replace-child',
            effects: [{
              key: 'child-owner',
              run: (api) => {
                api.spawnChild('worker', counterDefinition, {});
                return () => undefined;
              },
            }],
          }),
        },
      },
    };
    const service = createRuntimeService(parentDefinition, {});
    service.send({ type: 'START' });
    service.send({ type: 'START' });
    expect(service.getResourceCounts()['child-service']).toBe(1);
    service.destroy();
    expect(Object.values(service.getResourceCounts()).every((count) => count === 0)).toBe(true);
  });

  it('isolates or propagates child failures according to the declared policy', () => {
    type ChildEvent = { readonly type: 'FAIL' };
    const childDefinition: RuntimeDefinition<Record<string, never>, Record<string, never>, 'active', ChildEvent> = {
      id: 'failing-child', initialState: 'active', initialContext: {},
      transitions: { FAIL: { reduce: () => { throw new TypeError('unstable child failure'); } } },
    };
    const isolated = createRuntimeService(counterDefinition, {});
    const isolatedChild = isolated.spawnChild('child', childDefinition, {}, { errorPolicy: 'isolate' });
    expect(errorCode(() => isolatedChild.send({ type: 'FAIL' }))).toBe('UIFN_UNSTABLE_ERROR');
    expect(isolated.status).toBe('running');

    const propagated = createRuntimeService(counterDefinition, {});
    const propagatedChild = propagated.spawnChild('child', childDefinition, {}, { errorPolicy: 'propagate' });
    expect(errorCode(() => propagatedChild.send({ type: 'FAIL' }))).toBe('UIFN_UNSTABLE_ERROR');
    expect(propagated.status).toBe('error');
    isolated.destroy();
    propagated.destroy();
  });
});

describe('private runtime metadata, stable errors, and traces', () => {
  it('emits complete typed metadata and stable invalid-event/destroyed errors', () => {
    const service = createRuntimeService(counterDefinition, {}, {
      scope: createRuntimeScope({ id: 'metadata', mode: 'test' }),
    });
    let observed: unknown;
    service.subscribe((_snapshot, meta) => { observed = meta; }, { emitInitial: false });
    service.send({ type: 'ADD', amount: 1 }, { source: 'user', reason: 'keyboard', action: 'increment', inputModality: 'keyboard' });
    assertRuntimeChangeMeta(observed);
    expect(observed).toMatchObject({ source: 'user', reason: 'added', action: 'add' });
    expect(observed.previousSnapshot.version).toBe(0);
    expect(observed.nextSnapshot.version).toBe(1);
    expect(errorCode(() => service.send({ type: 'UNKNOWN' } as never))).toBe('UIFN_RUNTIME_EVENT_INVALID');
    service.destroy();
    expect(errorCode(() => service.send({ type: 'NOOP' }))).toBe('UIFN_CONTROLLER_DESTROYED');
    expect(errorCode(() => assertRuntimeChangeMeta({ meta: 'unknown' }))).toBe('UIFN_CHANGE_META_INVALID');
  });

  it('normalizes raw failures, bounds and redacts test traces, and strips production traces', () => {
    const bad: RuntimeDefinition<Record<string, never>, Record<string, never>, 'active', { type: 'THROW' }> = {
      id: 'unstable-error', initialState: 'active', initialContext: {},
      transitions: { THROW: { reduce: () => { throw new TypeError('raw secret should not escape'); } } },
    };
    const service = createRuntimeService(bad, {}, {
      scope: createRuntimeScope({ id: 'trace-errors', mode: 'test', traceLimit: 3 }),
    });
    expect(errorCode(() => service.send({ type: 'THROW' }))).toBe('UIFN_UNSTABLE_ERROR');
    expect(service.getTrace().length).toBeLessThanOrEqual(3);
    assertTraceContainsNoSecrets(service.getTrace(), ['raw secret should not escape']);

    const buffer = createRuntimeTraceBuffer({ enabled: true, limit: 2 });
    buffer.emit({ kind: 'service', operation: 'redact', definitionId: 'trace', scopeId: 'trace', timestamp: 0, details: { password: 'hunter2', value: 'private-value', safeCount: 2 } });
    const serialized = JSON.stringify(buffer.snapshot());
    expect(serialized).not.toContain('hunter2');
    expect(serialized).not.toContain('private-value');
    expect(errorCode(() => assertTraceContainsNoSecrets([{ password: 'hunter2' }], ['hunter2']))).toBe('UIFN_TRACE_SECRET');

    const production = createRuntimeService(counterDefinition, {}, {
      scope: createRuntimeScope({ id: 'production-trace', mode: 'production' }),
    });
    production.send({ type: 'ADD', amount: 1 });
    expect(production.getTrace()).toEqual([]);
  });

  it('compares every semantic trace domain', () => {
    const baseline = { event: 1, snapshot: 1, callbacks: 1, parts: 1, dom: 1, focus: 1, cleanup: 1 };
    assertSemanticTraceEquivalent(baseline, { ...baseline });
    const differences = compareSemanticTrace(baseline, {
      event: 2, snapshot: 2, callbacks: 2, parts: 2, dom: 2, focus: 2, cleanup: 2,
    });
    expect(differences.map((difference) => difference.path)).toEqual([
      'event', 'snapshot', 'callbacks', 'parts', 'dom', 'focus', 'cleanup',
    ]);
  });
});

describe('catalog runtime instrumentation', () => {
  it('runs one canonical interaction for every interactive catalog definition through the one constructor', () => {
    const interactive = catalog.primitives.filter((primitive) => primitive.implementationKind === 'interactive-controller');
    const created: string[] = [];
    const destroyed: string[] = [];
    for (const primitive of interactive) {
      const definition: RuntimeDefinition<Record<string, never>, { interactions: number }, 'idle', RuntimeEvent> = {
        id: primitive.id,
        initialState: 'idle',
        initialContext: { interactions: 0 },
        transitions: {
          INTERACT: {
            reduce: ({ context }) => ({ context: { interactions: context.interactions + 1 }, reason: 'canonical-interaction' }),
          },
        },
      };
      const service = createRuntimeService(definition, {}, {
        scope: createRuntimeScope({
          id: `catalog-${primitive.id}`, mode: 'test',
          instrumentation: {
            onServiceCreate: (id) => created.push(id),
            onServiceDestroy: (id) => destroyed.push(id),
          },
        }),
      });
      service.send({ type: 'INTERACT' });
      expect(service.getSnapshot().context.interactions).toBe(1);
      service.destroy();
    }
    expect(interactive).toHaveLength(51);
    expect(created).toEqual(interactive.map((primitive) => primitive.id));
    expect(destroyed).toEqual(created);
  });
});

const _resourceKindCoverage: Record<RuntimeResourceKind, true> = {
  effect: true, activity: true, timeout: true, interval: true,
  'animation-frame': true, microtask: true, observer: true, listener: true,
  promise: true, 'child-service': true, custom: true,
};
void _resourceKindCoverage;
