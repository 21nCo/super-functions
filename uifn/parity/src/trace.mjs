import { toSemanticJson } from '../../adapter-kit/src/conformance.ts';

const MARKER = 'data-uifn-phase-14-run';
const PART = 'data-uifn-phase-14-part';
const INSTANCE = 'data-uifn-phase-14-instance';

function stableJson(value) {
  return JSON.stringify(toSemanticJson(value));
}

function changedKeys(previous, next) {
  const left = toSemanticJson(previous);
  const right = toSemanticJson(next);
  if (!left || !right || Array.isArray(left) || Array.isArray(right) || typeof left !== 'object' || typeof right !== 'object') {
    return stableJson(left) === stableJson(right) ? [] : ['$value'];
  }
  return [...new Set([...Object.keys(left), ...Object.keys(right)])]
    .filter((key) => stableJson(left[key]) !== stableJson(right[key]))
    .sort();
}

function schedulerSequence(handle) {
  return Number(handle.slice(handle.lastIndexOf('-') + 1));
}

export function createPhase14Scheduler() {
  let sequence = 0;
  let currentTime = 0;
  const timeouts = new Map();
  const intervals = new Map();
  const frames = new Map();
  return {
    now: () => currentTime,
    setTimeout(callback, delayMs) {
      const handle = `timeout-${++sequence}`;
      timeouts.set(handle, {
        callback,
        dueAt: currentTime + Math.max(0, Number(delayMs) || 0),
      });
      return handle;
    },
    clearTimeout(handle) { timeouts.delete(handle); },
    setInterval(callback, intervalMs) {
      const handle = `interval-${++sequence}`;
      const duration = Math.max(1, Number(intervalMs) || 0);
      intervals.set(handle, { callback, intervalMs: duration, dueAt: currentTime + duration });
      return handle;
    },
    clearInterval(handle) { intervals.delete(handle); },
    requestAnimationFrame(callback) {
      const handle = `frame-${++sequence}`;
      frames.set(handle, callback);
      return handle;
    },
    cancelAnimationFrame(handle) { frames.delete(handle); },
    queueMicrotask(callback) { globalThis.queueMicrotask(callback); },
    async flush() {
      let turns = 0;
      const pendingIntervals = new Set(intervals.keys());
      const hasPendingInterval = () => [...pendingIntervals].some((handle) => intervals.has(handle));
      while ((frames.size > 0 || timeouts.size > 0 || hasPendingInterval()) && turns < 1_000) {
        turns += 1;
        if (frames.size > 0) {
          currentTime += 16;
          const pendingFrames = [...frames.values()];
          frames.clear();
          for (const callback of pendingFrames) await callback(currentTime);
        } else {
          const intervalEntries = [...intervals.entries()]
            .filter(([handle]) => pendingIntervals.has(handle));
          const timers = [...timeouts.entries(), ...intervalEntries];
          const nextDueAt = Math.min(...timers.map(([, { dueAt }]) => dueAt));
          currentTime = Math.max(currentTime, nextDueAt);
          const ready = timers
            .filter(([, entry]) => entry.dueAt <= currentTime)
            .sort(([left], [right]) => schedulerSequence(left) - schedulerSequence(right));
          for (const [handle, entry] of ready) {
            if (handle.startsWith('timeout-')) timeouts.delete(handle);
            else pendingIntervals.delete(handle);
            await entry.callback();
            const interval = intervals.get(handle);
            if (interval) interval.dueAt = currentTime + interval.intervalMs;
          }
        }
        await Promise.resolve();
        await Promise.resolve();
      }
      if (frames.size > 0 || timeouts.size > 0 || hasPendingInterval()) {
        throw new Error('UIFn phase-14 scheduler exceeded its deterministic flush limit.');
      }
    },
    resources() {
      return Object.freeze({
        timeouts: timeouts.size,
        intervals: intervals.size,
        timers: timeouts.size + intervals.size,
        frames: frames.size,
      });
    },
  };
}

export function createPhase14HarnessRuntime(vector) {
  const scheduler = createPhase14Scheduler();
  const callbacks = [];
  const environmentErrors = [];
  const environmentTraces = [];
  const fixture = { ...vector.rootFixture };
  if (fixture.capabilityFixture === 'resolved-clipboard') {
    delete fixture.capabilityFixture;
    fixture.capability = {
      async writeText() {},
      async readText() { return 'phase-14'; },
    };
  }
  if (fixture.getValueFixture === 'phase-14-value') {
    delete fixture.getValueFixture;
    fixture.getValue = () => 'phase-14';
  }
  for (const callback of vector.callbacks) {
    fixture[callback] = (...args) => callbacks.push({
      sequence: callbacks.length + 1,
      name: callback,
      arguments: args.map((value) => toSemanticJson(value, callback)),
    });
  }
  const token = vector.id;
  const environment = {
    mode: 'test',
    scopeId: token,
    hydrationSeed: token,
    direction: 'ltr',
    locale: 'en-US',
    timeZone: 'UTC',
    reducedMotion: true,
    forcedColors: false,
    generateId: (scope) => `${scope}-${token}`,
    now: scheduler.now,
    scheduler,
    warn: (warning) => environmentErrors.push({ code: warning.code, operation: 'warn', recoverable: true }),
    error: (error) => environmentErrors.push({ code: error.code ?? error.name ?? 'UIFN_UNKNOWN_ERROR', operation: 'error', recoverable: Boolean(error.recoverable) }),
    trace: (trace) => environmentTraces.push(toSemanticJson(trace)),
  };
  return {
    token,
    scheduler,
    callbacks,
    environmentErrors,
    environmentTraces,
    rootProps: {
      ...fixture,
      environment,
      [MARKER]: token,
      [PART]: vector.anatomy[0].id,
      [INSTANCE]: 'root',
    },
  };
}

export function phase14PartProps(vector, part) {
  const props = {
    [MARKER]: vector.id,
    [PART]: part.id,
    [INSTANCE]: part.cardinality === 'many' ? String(part.value) : 'one',
  };
  if (part.cardinality === 'many') props.value = part.value;
  return props;
}

const BOOLEAN_ATTRIBUTES = new Set(['checked', 'disabled', 'hidden', 'inert', 'multiple', 'readonly', 'required', 'selected']);

function semanticAttributeValue(name, value) {
  if (value === '' && BOOLEAN_ATTRIBUTES.has(name)) return true;
  if (value === 'true') return true;
  if (value === 'false') return false;
  const numeric = Number(value);
  return value.trim() !== '' && Number.isFinite(numeric) && String(numeric) === value ? numeric : value;
}

function normalizeStyle(value) {
  return value.split(';').map((entry) => entry.trim()).filter(Boolean).map((entry) => {
    const separator = entry.indexOf(':');
    return separator < 0 ? entry : `${entry.slice(0, separator).trim()}:${entry.slice(separator + 1).trim()}`;
  }).sort().join(';');
}

function capturePart(element) {
  const aria = {};
  const data = {};
  const attributes = {};
  for (const attribute of [...element.attributes]) {
    const name = attribute.name;
    const value = semanticAttributeValue(name, attribute.value);
    if (name.startsWith('aria-')) aria[name.slice(5)] = value;
    else if (name.startsWith('data-')) {
      if (![MARKER, PART, INSTANCE].includes(name)) data[name.slice(5)] = value;
    } else if (!['id', 'role', 'tabindex', 'hidden', 'disabled'].includes(name)) {
      attributes[name] = name === 'style' ? normalizeStyle(String(attribute.value)) : value;
    }
  }
  if (element instanceof HTMLInputElement) {
    const valueKey = `${element.type}:${element.name || element.getAttribute(PART) || 'value'}`;
    attributes.value = toSemanticJson(element.value, valueKey);
    if (['checkbox', 'radio'].includes(element.type)) attributes.checked = element.checked;
  }
  return {
    part: element.getAttribute(PART),
    instance: element.getAttribute(INSTANCE) ?? undefined,
    tag: element.tagName.toLowerCase(),
    role: element.getAttribute('role') ?? undefined,
    id: element.id || undefined,
    tabIndex: element.hasAttribute('tabindex') ? element.tabIndex : undefined,
    hidden: element.hidden || element.hasAttribute('hidden'),
    disabled: Boolean(element.disabled) || element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true',
    aria,
    data,
    attributes,
  };
}

function escapeSelector(value) {
  return globalThis.CSS?.escape?.(value) ?? value.replace(/["\\]/g, '\\$&');
}

function markedElements(token) {
  return [...document.querySelectorAll(`[${MARKER}="${escapeSelector(token)}"]`)]
    .sort((left, right) => {
      const leftKey = `${left.getAttribute(PART)}:${left.getAttribute(INSTANCE) ?? ''}`;
      const rightKey = `${right.getAttribute(PART)}:${right.getAttribute(INSTANCE) ?? ''}`;
      return leftKey.localeCompare(rightKey);
    });
}

function formValues(elements) {
  const values = {};
  for (const element of elements) {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)) continue;
    const key = element.name || `${element.getAttribute(PART)}:${element.getAttribute(INSTANCE) ?? ''}`;
    if (element instanceof HTMLInputElement && ['checkbox', 'radio'].includes(element.type)) values[key] = element.checked;
    else {
      const valueKey = element instanceof HTMLInputElement
        ? `${element.type}:${key}`
        : key;
      values[key] = toSemanticJson(element.value, valueKey);
    }
  }
  return Object.fromEntries(Object.entries(values).sort(([left], [right]) => left.localeCompare(right)));
}

function focusEntry(token, checkpoint, sequence) {
  const active = document.activeElement;
  const marked = active instanceof Element ? active.closest(`[${MARKER}="${escapeSelector(token)}"]`) : null;
  return {
    sequence,
    checkpoint,
    part: marked?.getAttribute(PART) ?? null,
    tag: active && active !== document.body ? active.tagName.toLowerCase() : null,
  };
}

export function capturePhase14Checkpoint(token, checkpoint, bridge, sequence) {
  const elements = markedElements(token);
  const snapshot = bridge.getSnapshot();
  return {
    transaction: {
      sequence,
      version: snapshot.version,
      status: snapshot.status,
      state: toSemanticJson(snapshot.state),
      changedKeys: [],
    },
    parts: { checkpoint, parts: elements.map(capturePart) },
    dom: {
      checkpoint,
      rootConnected: Boolean(elements.find((element) => element.getAttribute(PART) === 'root')?.isConnected),
      semanticNodeCount: elements.length,
      formValues: formValues(elements),
    },
    focus: focusEntry(token, checkpoint, sequence),
    rawState: snapshot.state,
  };
}

export async function runPhase14Actions(vector, bridge, runtime, capture) {
  const actions = [];
  const checkpoints = [];
  let previous = capture('initial', 1);
  checkpoints.push(previous);
  let sequence = 1;
  for (const action of vector.actions) {
    sequence += 1;
    const implementation = bridge.getActions()[action.name];
    if (typeof implementation !== 'function') {
      const error = new Error(`${vector.primitive}.${action.name} is absent from the mounted public tree bridge.`);
      error.code = 'UIFN_PARITY_ACTION_MISSING';
      throw error;
    }
    const callbackCount = runtime.callbacks.length;
    if (runtime.invokeAction) {
      await runtime.invokeAction(implementation, action.arguments, Boolean(action.await));
    } else {
      const result = implementation(...action.arguments);
      if (action.await || result instanceof Promise) await result;
      await Promise.resolve();
      await Promise.resolve();
    }
    await runtime.scheduler.flush?.();
    const next = capture(`after-${sequence - 1}-${action.name}`, sequence);
    const changed = changedKeys(previous.rawState, next.rawState);
    next.transaction.changedKeys = changed;
    const emittedCallbacks = runtime.callbacks.slice(callbackCount);
    const setter = /^set(.+)$/.exec(action.name);
    const expectedStateKey = setter
      ? `${setter[1][0].toLowerCase()}${setter[1].slice(1)}`
      : undefined;
    const expectedCallbackName = setter
      ? `on${setter[1]}Change`
      : vector.callbacks.length === 1
        ? vector.callbacks[0]
        : undefined;
    const matchingCallback = expectedCallbackName
      ? emittedCallbacks.find((callback) => callback.name === expectedCallbackName)
      : undefined;
    const semanticState = toSemanticJson(next.rawState);
    const expectedStateCandidates = expectedStateKey
      ? [expectedStateKey, expectedStateKey.replace(/Metrics$/, '')]
      : [];
    const observedStateKey = semanticState && !Array.isArray(semanticState) && typeof semanticState === 'object'
      ? expectedStateCandidates.find((key) => key in semanticState)
      : undefined;
    const stateObserved = observedStateKey
      ? changed.includes(observedStateKey)
      : expectedStateKey
        ? false
        : changed.length > 0;
    const semanticArgument = setter && action.arguments.length === 1
      ? toSemanticJson(action.arguments[0])
      : undefined;
    const statePayloadObserved = setter && action.arguments.length === 1
      && semanticState && !Array.isArray(semanticState) && typeof semanticState === 'object'
      && observedStateKey !== undefined
      && changed.includes(observedStateKey)
      && stableJson(semanticState[observedStateKey]) === stableJson(semanticArgument);
    const expectedCallbackValue = setter && observedStateKey
      && semanticState && !Array.isArray(semanticState) && typeof semanticState === 'object'
      && observedStateKey in semanticState
      ? semanticState[observedStateKey]
      : setter
        ? toSemanticJson(action.arguments[0], expectedCallbackName)
        : undefined;
    const callbackObserved = matchingCallback !== undefined
      && (!setter || stableJson(matchingCallback.arguments[0]) === stableJson(expectedCallbackValue));
    const observed = expectedCallbackName
      ? matchingCallback
        ? callbackObserved
        : setter
          ? Boolean(statePayloadObserved)
          : stateObserved
      : stateObserved;
    actions.push({
      sequence,
      name: action.name,
      arguments: action.arguments.map((value) => toSemanticJson(value)),
      observed,
    });
    checkpoints.push(next);
    previous = next;
  }
  return { actions, checkpoints };
}

function emptyResources() {
  return {
    listener: 0,
    observer: 0,
    timer: 0,
    animationFrame: 0,
    layer: 0,
    focusScope: 0,
    modalLock: 0,
    positioner: 0,
    portal: 0,
    presence: 0,
    formBridge: 0,
    liveRegion: 0,
    modality: 0,
    total: 0,
  };
}

export function capturePhase14Cleanup(token, bridge, scheduler) {
  const counters = bridge.getLifecycleCounters();
  const resources = bridge.getDomResources?.() ?? emptyResources();
  const scheduled = scheduler.resources();
  const domBalanced = counters.activeDomBindings === undefined
    ? counters.domGeneration === counters.domDestroyCount
    : counters.activeDomBindings === 0 && counters.domGeneration === counters.domDestroyCount;
  return {
    controllerDestroyed: counters.activeControllers === 0,
    domReleased: domBalanced && resources.total === 0,
    subscriptions: counters.subscribers,
    listeners: resources.listener,
    observers: resources.observer,
    timers: resources.timer + scheduled.timers,
    frames: resources.animationFrame + scheduled.frames,
    portals: resources.portal,
    layers: resources.layer,
    locks: resources.modalLock,
    inertRoots: document.querySelectorAll('[inert]').length,
    childServices: resources.focusScope + resources.positioner + resources.presence
      + resources.formBridge + resources.liveRegion + resources.modality,
    connectedSemanticNodes: markedElements(token).length,
  };
}

function cleanupPassed(cleanup) {
  return cleanup.controllerDestroyed
    && cleanup.domReleased
    && Object.entries(cleanup).every(([key, value]) => key === 'controllerDestroyed' || key === 'domReleased' || value === 0);
}

export function assemblePhase14Trace({
  vector,
  framework,
  frameworkVersion,
  installMode,
  runtime,
  run,
  cleanup,
  errors = [],
  environment = {},
}) {
  const transactions = run.checkpoints.map((checkpoint) => checkpoint.transaction);
  const parts = run.checkpoints.map((checkpoint) => checkpoint.parts);
  const dom = run.checkpoints.map((checkpoint) => checkpoint.dom);
  const focus = run.checkpoints.map((checkpoint) => checkpoint.focus);
  const allErrors = [...runtime.environmentErrors, ...errors].map((error, index) => ({
    sequence: index + 1,
    code: error.code ?? 'UIFN_UNKNOWN_ERROR',
    operation: error.operation ?? 'public-tree-vector',
    recoverable: Boolean(error.recoverable),
  }));
  const observed = run.actions.every((action) => action.observed);
  return {
    schemaVersion: 1,
    primitive: vector.primitive,
    framework,
    installMode,
    vectorId: vector.id,
    environment: {
      runtime: 'jsdom',
      runtimeVersion: '27',
      frameworkVersion,
      browser: 'jsdom',
      browserVersion: '27',
      os: 'test',
      direction: 'ltr',
      locale: 'en-US',
      timeZone: 'UTC',
      ...environment,
    },
    steps: [
      { sequence: 1, kind: 'lifecycle', name: 'mount-public-tree' },
      ...run.actions.map((action) => ({
        sequence: action.sequence,
        kind: 'action',
        name: action.name,
        arguments: action.arguments,
      })),
      { sequence: run.actions.length + 2, kind: 'lifecycle', name: 'unmount-public-tree' },
    ],
    transactions,
    actions: run.actions,
    parts,
    dom,
    focus,
    callbacks: runtime.callbacks,
    errors: allErrors,
    cleanup,
    result: observed && allErrors.length === 0 && cleanupPassed(cleanup) ? 'passed' : 'failed',
  };
}

export const phase14TraceMarkers = Object.freeze({ run: MARKER, part: PART, instance: INSTANCE });
