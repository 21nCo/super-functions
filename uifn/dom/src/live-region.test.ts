import { describe, expect, it, vi } from 'vitest';
import { createUIFnLiveRegion } from './live-region';
import type { UIFnDomScope } from './scope';

interface ScheduledTask {
  callback: () => void;
  cancelled: boolean;
}

interface FakeElement {
  readonly nodeType: number;
  readonly style: Record<string, string>;
  readonly attributes: Map<string, string>;
  readonly children: FakeElement[];
  textContent: string;
  setAttribute(name: string, value: string): void;
  appendChild(child: FakeElement): void;
  remove(): void;
}

function element(): FakeElement {
  return {
    nodeType: 1,
    style: {},
    attributes: new Map(),
    children: [],
    textContent: '',
    setAttribute(name, value) { this.attributes.set(name, value); },
    appendChild(child) { this.children.push(child); },
    remove() { /* The lifecycle assertion is covered by platform tests. */ },
  };
}

function fixture() {
  const root = element();
  const timeouts: ScheduledTask[] = [];
  const frames: ScheduledTask[] = [];
  const schedule = (tasks: ScheduledTask[], callback: () => void) => {
    const task = { callback, cancelled: false };
    tasks.push(task);
    return () => { task.cancelled = true; };
  };
  const run = (tasks: ScheduledTask[]) => {
    const task = tasks.shift();
    if (!task) throw new Error('Expected a scheduled task.');
    if (!task.cancelled) task.callback();
  };
  const document = {
    createElement: () => element(),
    body: root,
    documentElement: root,
  };
  const scope = {
    assertAlive: vi.fn(),
    document,
    root,
    environment: {
      scopeId: 'test-scope',
      now: () => 0,
      trace: vi.fn(),
    },
    track: () => () => undefined,
    setTimeout: (callback: () => void) => schedule(timeouts, callback),
    requestAnimationFrame: (callback: (timestamp: number) => void) => schedule(frames, () => callback(0)),
  } as unknown as UIFnDomScope;

  return {
    liveRegion: createUIFnLiveRegion(scope),
    status: () => root.children[0]!.children[0]!,
    runTimeout: () => run(timeouts),
    runFrame: () => run(frames),
  };
}

describe('createUIFnLiveRegion', () => {
  it.each(['before publish', 'during frame'] as const)(
    'continues publishing after an earlier announcement is cleared %s',
    (timing) => {
      const { liveRegion, status, runTimeout, runFrame } = fixture();
      const first = liveRegion.announce({ message: 'First' });
      liveRegion.announce({ message: 'Second' });

      if (timing === 'during frame') runTimeout();
      liveRegion.clear(first);
      if (timing === 'before publish') runTimeout();
      if (timing === 'during frame') runFrame();
      runTimeout();
      runFrame();

      expect(status().textContent).toBe('Second');
      liveRegion.destroy();
    },
  );
});
