import { describe, expect, it } from 'vitest';
import {
  advanceTypeahead,
  alignRangeValue,
  createUIFnPartId,
  createAsyncList,
  createListCollection,
  createListSelection,
  createLocaleMatcher,
  createTreeCollection,
  createVirtualizerContract,
  findTypeaheadMatch,
  getNextCollectionKey,
  normalizeRangeValues,
  parseUIFnColor,
  reconcileCollectionKey,
  reconcileListSelection,
  selectCollectionRange,
  selectCollectionKey,
  stepRangeValue,
} from '../algorithms';
import { UIFnError } from '../errors';

interface Item { key: string; text: string; disabled?: boolean; }
const collection = (items: readonly Item[]) => createListCollection({
  items, getKey: (item: Item) => item.key, getTextValue: (item: Item) => item.text,
  isDisabled: (item: Item) => Boolean(item.disabled),
});

function random(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x1_0000_0000;
  };
}

describe('PHASE_06 canonical shared algorithms', () => {
  it('matches a mutation/navigation model across deterministic generated sequences', () => {
    for (let seed = 1; seed <= 64; seed += 1) {
      const next = random(seed);
      let items: Item[] = Array.from({ length: 8 }, (_, index) => ({ key: `k${index}`, text: `Item ${index}` }));
      let active: string | null = 'k0';
      for (let step = 0; step < 80; step += 1) {
        const previous = collection(items);
        const previousIndex = active === null ? 0 : previous.indexOf(active);
        const operation = Math.floor(next() * 4);
        if (operation === 0 && items.length > 1) items.splice(Math.floor(next() * items.length), 1);
        else if (operation === 1) items.splice(Math.floor(next() * (items.length + 1)), 0, { key: `s${seed}-${step}`, text: `Élément ${step}` });
        else if (operation === 2 && items.length > 1) items = [...items].sort(() => next() - 0.5);
        else if (items.length > 0) {
          const index = Math.floor(next() * items.length);
          items[index] = { ...items[index]!, disabled: !items[index]!.disabled };
        }
        const current = collection(items);
        active = reconcileCollectionKey(current, { previousKey: active, previousIndex });
        expect(active === null || current.enabledKeys.includes(active)).toBe(true);
        const expectedEnabled = items.filter((item) => !item.disabled).map((item) => item.key);
        expect(current.enabledKeys).toEqual(expectedEnabled);
        if (active !== null && expectedEnabled.length > 0) {
          const expected = expectedEnabled[(expectedEnabled.indexOf(active) + 1) % expectedEnabled.length];
          expect(getNextCollectionKey({ collection: current, key: 'ArrowDown', currentKey: active, orientation: 'vertical' })).toBe(expected);
        }
      }
    }
  });

  it('rejects duplicate keys and preserves disabled invariants after reorder', () => {
    expect(() => collection([{ key: 'same', text: 'one' }, { key: 'same', text: 'two' }])).toThrowError(UIFnError);
    const reordered = collection([{ key: 'b', text: 'B', disabled: true }, { key: 'a', text: 'A' }]);
    expect(getNextCollectionKey({ collection: reordered, key: 'Home', currentKey: 'b', orientation: 'vertical' })).toBe('a');
  });

  it('uses locale-aware Unicode typeahead with repeated-character cycling', () => {
    const values = collection([
      { key: 'istanbul', text: 'İstanbul' }, { key: 'izmir', text: 'İzmir' },
      { key: 'eclair', text: 'Éclair' }, { key: 'disabled', text: 'École', disabled: true },
    ]);
    expect(findTypeaheadMatch({ collection: values, query: 'e', currentKey: null, locale: 'fr' })).toBe('eclair');
    const initial = { query: '', matchedKey: 'istanbul' as string | null, updatedAt: 0 };
    const cycled = advanceTypeahead(initial, 'i', { collection: values, locale: 'tr', now: 10 });
    const nextCycle = advanceTypeahead(cycled, 'i', { collection: values, locale: 'tr', now: 20 });
    expect(cycled.matchedKey).toBe('istanbul');
    expect(nextCycle.matchedKey).toBe('izmir');
    expect(createLocaleMatcher('de').equals('straße', 'STRASSE')).toBe(true);
  });

  it('models single, toggle, range, and mutation-safe list selection', () => {
    const values = collection([
      { key: 'a', text: 'A' }, { key: 'b', text: 'B', disabled: true },
      { key: 'c', text: 'C' }, { key: 'd', text: 'D' },
    ]);
    let selection = createListSelection<string>({ mode: 'multiple', behavior: 'replace' });
    selection = selectCollectionKey(values, selection, 'a');
    selection = selectCollectionRange(values, selection, 'd');
    expect([...selection.selectedKeys]).toEqual(['a', 'c', 'd']);
    const mutated = collection([{ key: 'd', text: 'D' }, { key: 'c', text: 'C', disabled: true }]);
    expect([...reconcileListSelection(mutated, selection).selectedKeys]).toEqual(['d']);
  });

  it('keeps range normalization bounded, sorted, step-aligned, and idempotent', () => {
    for (let seed = 1; seed <= 32; seed += 1) {
      const next = random(seed);
      const values = Array.from({ length: 4 }, () => next() * 240 - 70);
      const normalized = normalizeRangeValues(values, { min: -10, max: 100, step: 0.25 });
      expect(normalized.every((value) => value >= -10 && value <= 100)).toBe(true);
      expect(normalized).toEqual([...normalized].sort((a, b) => a - b));
      expect(normalizeRangeValues(normalized, { min: -10, max: 100, step: 0.25 })).toEqual(normalized);
      normalized.forEach((value) => expect(alignRangeValue(value, { min: -10, max: 100, step: 0.25 })).toBe(value));
    }
  });

  it('handles scientific range steps, aligned End keys, and malformed colors', () => {
    expect(alignRangeValue(2.5e-13, { min: 0, max: 1e-12, step: 1.25e-13 })).toBe(2.5e-13);
    expect(stepRangeValue(3, 'End', { min: 0, max: 10, step: 3 })).toBe(9);
    expect(stepRangeValue(3, 'End', { min: 0, max: 10, step: 4 })).toBe(8);
    expect(stepRangeValue(0.1, 'End', { min: 0.1, max: 0.3, step: 0.1 })).toBe(0.3);
    expect(stepRangeValue(0.1, 'End', { min: 0.1, max: 0.3 - Number.EPSILON, step: 0.1 })).toBe(0.2);
    expect(Number.isFinite(alignRangeValue(Number.MAX_VALUE, { min: 0, max: Number.MAX_VALUE, step: 0.1 }))).toBe(true);
    expect(() => alignRangeValue(1, { min: 0, max: 10, step: Number.POSITIVE_INFINITY })).toThrowError(UIFnError);
    expect(() => parseUIFnColor('rgb(1..2 3 4)')).toThrowError(UIFnError);
  });

  it('keeps dynamic part IDs Unicode-safe and collision-free', () => {
    const spaced = createUIFnPartId('scope', 'list', 'item', 'a b');
    const dashed = createUIFnPartId('scope', 'list', 'item', 'a-b');
    const unicode = createUIFnPartId('scope', 'list', 'item', '你好');
    expect(new Set([spaced, dashed, unicode]).size).toBe(3);
    expect(unicode).toMatch(/^scope-list-item-key-/);
  });

  it('isolates async subscribers and clears loading state on cancellation', async () => {
    let resolve!: (items: readonly string[]) => void;
    const list = createAsyncList<string>({ load: () => new Promise((done) => { resolve = done; }) });
    const observed: string[] = [];
    let initial = true;
    list.subscribe(() => {
      if (initial) {
        initial = false;
        return;
      }
      throw new Error('listener failed');
    });
    list.subscribe((state) => observed.push(state.status));
    const pending = list.load();
    list.cancel();
    expect(list.state.status).toBe('idle');
    resolve(['late']);
    await pending;
    expect(list.state.items).toEqual([]);
    expect(observed).toContain('loading');
  });

  it('does not let a reentrant abort listener cancel the replacement AsyncList load', async () => {
    const pending: Array<{ signal: AbortSignal; resolve: (items: readonly string[]) => void }> = [];
    const list = createAsyncList<string>({ load: ({ signal }) => new Promise((resolve) => pending.push({ signal, resolve })) });
    const first = list.load('first');
    pending[0]!.signal.addEventListener('abort', () => { void list.load('replacement'); });
    list.cancel();
    expect(list.state.status).toBe('loading');
    pending[1]!.resolve(['replacement']);
    pending[0]!.resolve(['stale']);
    await Promise.all([first, Promise.resolve()]);
    await Promise.resolve();
    expect(list.state).toMatchObject({ status: 'loaded', items: ['replacement'] });
  });

  it('supports collation expansions and immutable numeric-key selections', () => {
    const matcher = createLocaleMatcher('de');
    expect(matcher.startsWith('Äpfel', 'AE')).toBe(true);
    expect(matcher.startsWith('1 item', '0000000001')).toBe(true);
    expect(matcher.startsWith('0000000001 item', '1')).toBe(true);
    expect(matcher.includes('Straße', 'STRASSE')).toBe(true);
    expect(matcher.includes(`${'a'.repeat(50_000)}Straße`, 'STRASSE')).toBe(true);
    expect(matcher.includes(`${'a'.repeat(50_000)}b`, 'STRASSE')).toBe(false);
    expect(matcher.includes('ß', 's')).toBe(false);
    expect(matcher.includes('aß', 'as')).toBe(false);
    expect(matcher.includes('👍🏽', '👍')).toBe(false);
    expect(matcher.includes('🇮🇳', '🇮')).toBe(false);
    const numeric = createListCollection({
      items: [0, 1, 2],
      getKey: (value) => value,
      getTextValue: String,
    });
    let selection = createListSelection<number>({ mode: 'multiple', anchorKey: 0, selectedKeys: [0] });
    selection = selectCollectionRange(numeric, selection, 2);
    expect([...selection.selectedKeys]).toEqual([0, 1, 2]);
    expect((selection.selectedKeys as Set<number>).add).toBeUndefined();
    expect(selectCollectionRange(numeric, selection, 99)).toBe(selection);
  });

  it('rejects partial grapheme matches when Intl.Segmenter is unavailable', () => {
    const descriptor = Object.getOwnPropertyDescriptor(Intl, 'Segmenter');
    Object.defineProperty(Intl, 'Segmenter', { configurable: true, value: undefined });
    try {
      const matcher = createLocaleMatcher('en');
      expect(matcher.startsWith('👍🏽', '👍')).toBe(false);
      expect(matcher.includes('🇮🇳', '🇮')).toBe(false);
      expect(matcher.includes('👍🏽', '👍🏽')).toBe(true);
      expect(matcher.startsWith('👍🏽 ready', '👍🏽')).toBe(true);
      expect(matcher.includes('ready 👍🏽 now', '👍🏽')).toBe(true);
      expect(matcher.includes('family 👨‍👩‍👧‍👦 ready', '👨‍👩‍👧‍👦')).toBe(true);
      expect(matcher.startsWith('a\u200db', 'a')).toBe(true);
    } finally {
      if (descriptor) Object.defineProperty(Intl, 'Segmenter', descriptor);
      else Reflect.deleteProperty(Intl, 'Segmenter');
    }
  });

  it('exposes deterministic virtualization without requiring every item in the DOM', () => {
    const virtualizer = createVirtualizerContract({ count: 10_000, estimateSize: 32, overscan: 3 });
    expect(virtualizer.getWindow(3_200, 320)).toEqual({ start: 97, end: 112, offset: 3_104, totalSize: 320_000 });
    expect(virtualizer.getOffsetForIndex(500)).toBe(16_000);
  });

  it('flattens expanded trees and rejects cycles through the collection invariant', () => {
    type Node = { key: string; children?: Node[] };
    const child: Node = { key: 'child' };
    const root: Node = { key: 'root', children: [child] };
    const tree = createTreeCollection({ items: [root], getKey: (node: Node) => node.key, getChildren: (node: Node) => node.children });
    expect(tree.flatten(new Set(['root'])).keys).toEqual(['root', 'child']);
    child.children = [root];
    expect(() => tree.flatten(new Set(['root', 'child']))).toThrowError(UIFnError);
  });

  it('cancels stale AsyncList requests and publishes only the latest result', async () => {
    const pending: Array<{ signal: AbortSignal; resolve: (items: readonly string[]) => void }> = [];
    const list = createAsyncList<string>({ load: ({ signal }) => new Promise((resolve) => pending.push({ signal, resolve })) });
    const first = list.load('a');
    const second = list.load('b');
    expect(pending[0]?.signal.aborted).toBe(true);
    pending[0]?.resolve(['stale']); pending[1]?.resolve(['latest']);
    await Promise.all([first, second]);
    expect(list.state).toMatchObject({ status: 'loaded', items: ['latest'], requestId: 2 });
    list.destroy();
  });
});
