import type { RuntimeScheduler } from './types';

export function createRuntimeScheduler(): RuntimeScheduler {
  return {
    now: () => Date.now(),
    setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, Math.max(0, delayMs)),
    clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
    setInterval: (callback, intervalMs) => globalThis.setInterval(callback, Math.max(1, intervalMs)),
    clearInterval: (handle) => globalThis.clearInterval(handle as ReturnType<typeof setInterval>),
    requestAnimationFrame(callback) {
      return globalThis.setTimeout(() => callback(Date.now()), 16);
    },
    cancelAnimationFrame: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
    queueMicrotask: (callback) => globalThis.queueMicrotask(callback),
  };
}

interface ManualTask {
  id: number;
  kind: 'timeout' | 'interval' | 'frame' | 'microtask';
  dueAt: number;
  intervalMs?: number;
  callback: (() => void) | ((timestamp: number) => void);
}

export interface ManualRuntimeScheduler extends RuntimeScheduler {
  advanceBy(durationMs: number): void;
  flushMicrotasks(): void;
  pending(): Readonly<Record<ManualTask['kind'], number>>;
}

export function createManualRuntimeScheduler(initialTime = 0): ManualRuntimeScheduler {
  let now = initialTime;
  let nextId = 1;
  const tasks = new Map<number, ManualTask>();
  const cancelled = new Set<number>();
  let runningTask: ManualTask | undefined;

  const add = (task: Omit<ManualTask, 'id'>) => {
    const id = nextId;
    nextId += 1;
    tasks.set(id, { ...task, id });
    return id;
  };

  const remove = (handle: unknown) => {
    if (typeof handle === 'number') {
      const task = tasks.get(handle) ?? (runningTask?.id === handle ? runningTask : undefined);
      if (task?.kind === 'interval') cancelled.add(handle);
      tasks.delete(handle);
    }
  };

  const nextDue = (endAt: number, microtasksOnly = false) => [...tasks.values()]
    .filter((task) => task.dueAt <= endAt && (!microtasksOnly || task.kind === 'microtask'))
    .sort((left, right) => left.dueAt - right.dueAt || left.id - right.id)[0];

  const runUntil = (endAt: number, microtasksOnly = false) => {
    let steps = 0;
    while (true) {
      const task = nextDue(endAt, microtasksOnly);
      if (!task) break;
      steps += 1;
      if (steps > 100_000) throw new Error('Manual runtime scheduler exceeded 100000 tasks.');
      tasks.delete(task.id);
      now = Math.max(now, task.dueAt);
      runningTask = task;
      try {
        if (task.kind === 'frame') (task.callback as (timestamp: number) => void)(now);
        else (task.callback as () => void)();
      } finally {
        runningTask = undefined;
      }
      if (task.kind === 'interval' && task.intervalMs !== undefined && !cancelled.has(task.id)) {
        tasks.set(task.id, { ...task, dueAt: now + task.intervalMs });
      } else {
        cancelled.delete(task.id);
      }
    }
  };

  return {
    now: () => now,
    setTimeout: (callback, delayMs) => add({ kind: 'timeout', dueAt: now + Math.max(0, delayMs), callback }),
    clearTimeout: remove,
    setInterval: (callback, intervalMs) => add({ kind: 'interval', dueAt: now + Math.max(1, intervalMs), intervalMs: Math.max(1, intervalMs), callback }),
    clearInterval: remove,
    requestAnimationFrame: (callback) => add({ kind: 'frame', dueAt: now + 16, callback }),
    cancelAnimationFrame: remove,
    queueMicrotask: (callback) => {
      add({ kind: 'microtask', dueAt: now, callback });
    },
    advanceBy(durationMs) {
      const endAt = now + Math.max(0, durationMs);
      runUntil(endAt);
      now = endAt;
    },
    flushMicrotasks() {
      runUntil(now, true);
    },
    pending() {
      const result: Record<ManualTask['kind'], number> = { timeout: 0, interval: 0, frame: 0, microtask: 0 };
      for (const task of tasks.values()) result[task.kind] += 1;
      return Object.freeze(result);
    },
  };
}
