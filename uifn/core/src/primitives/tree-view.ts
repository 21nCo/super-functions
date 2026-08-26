import { createUIFnController, type UIFnController } from '../controller';
import { createUIFnEnvironment, type UIFnEnvironment } from '../environment';
import { createUIFnError } from '../errors';
import { createControlledValue } from '../internal/runtime/controlled';
import { createStateChannel } from '../internal/runtime/state-channel';
import { focusUIFnPart } from '../internal/runtime/focus';
import { mergePartProps, type UIFnPartProps } from '../parts';
import type { TypeaheadState } from '../algorithms';
import type { ChangeMeta } from './shared';
import {
  EMPTY_UIFN_TYPEAHEAD,
  advanceUIFnNavigationTypeahead,
  createUIFnNavigationCollection,
  createUIFnNavigationIds,
  moveUIFnNavigationKey,
  repairUIFnNavigationKey,
  resolveUIFnPrimitiveKey,
  type UIFnNavigationItem,
} from './navigation';

export interface TreeViewItem {
  readonly id: string;
  readonly textValue?: string;
  readonly disabled?: boolean;
  readonly children?: readonly TreeViewItem[];
  readonly hasChildren?: boolean;
  readonly status?: TreeViewWorkflowStatus;
}
export type TreeViewWorkflowStatus = 'pending' | 'current' | 'complete' | 'error';
export interface TreeViewProps {
  readonly items: readonly TreeViewItem[];
  readonly expanded?: readonly string[];
  readonly defaultExpanded?: readonly string[];
  readonly onExpandedChange?: (value: readonly string[]) => void;
  readonly selection?: readonly string[];
  readonly defaultSelection?: readonly string[];
  readonly onSelectionChange?: (value: readonly string[]) => void;
  readonly selectionMode?: 'none' | 'single' | 'multiple';
  readonly dir?: 'ltr' | 'rtl';
  readonly loop?: boolean;
  readonly locale?: string;
}
interface FlatTreeItem extends UIFnNavigationItem {
  readonly parentId?: string;
  readonly depth: number;
  readonly posInSet: number;
  readonly setSize: number;
  readonly expandable: boolean;
}
export interface TreeViewState {
  readonly items: readonly TreeViewItem[];
  readonly expanded: readonly string[];
  readonly expandedControlled: boolean;
  readonly selection: readonly string[];
  readonly selectionControlled: boolean;
  readonly selectionMode: 'none' | 'single' | 'multiple';
  readonly focusedItem: string | null;
  readonly visibleItems: readonly FlatTreeItem[];
  readonly loading: readonly string[];
  readonly statuses: Readonly<Record<string, TreeViewWorkflowStatus>>;
  readonly dir: 'ltr' | 'rtl';
  readonly loop: boolean;
  readonly typeahead: TypeaheadState<string>;
  readonly requestedExpandedRepair: readonly string[] | null;
  readonly requestedSelectionRepair: readonly string[] | null;
  readonly lastChangeMeta?: ChangeMeta<readonly string[]>;
}
export interface TreeViewActions {
  setItems(items: readonly TreeViewItem[]): void;
  focusItem(id: string): void;
  handleKeyDown(key: string, currentItem?: string): string | null;
  expand(id: string): void;
  collapse(id: string): void;
  toggleExpanded(id: string): void;
  syncExpanded(value: readonly string[]): void;
  select(id: string, options?: { toggle?: boolean }): void;
  syncSelection(value: readonly string[]): void;
  startLoading(id: string): void;
  finishLoading(id: string, children: readonly TreeViewItem[]): void;
  setStatus(id: string, status: TreeViewWorkflowStatus): void;
}
type StaticPart = { readonly name: string; getProps(userProps?: UIFnPartProps): UIFnPartProps };
type ValuePart = { readonly name: string; getProps(value: string, userProps?: UIFnPartProps): UIFnPartProps };
export interface TreeViewControllerParts {
  readonly root: StaticPart;
  readonly label: StaticPart;
  readonly tree: StaticPart;
  readonly item: ValuePart;
  readonly itemTrigger: ValuePart;
  readonly itemText: ValuePart;
  readonly branch: ValuePart;
  readonly indicator: ValuePart;
}
export type TreeViewController = UIFnController<TreeViewState, TreeViewActions, TreeViewControllerParts, TreeViewProps>;

function sameArray(a: readonly string[], b: readonly string[]): boolean { return a.length === b.length && a.every((value, index) => value === b[index]); }
function normalizeKeys(values: readonly string[]): readonly string[] { return [...new Set(values.filter(Boolean))]; }
function flattenAll(items: readonly TreeViewItem[]): readonly FlatTreeItem[] {
  const result: FlatTreeItem[] = []; const seen = new Set<string>();
  const visit = (nodes: readonly TreeViewItem[], parentId: string | undefined, depth: number, ancestors: Set<string>) => {
    nodes.forEach((item, index) => {
      if (!item.id || seen.has(item.id) || ancestors.has(item.id)) throw createUIFnError({ code: 'UIFN_NAVIGATION_COLLECTION_INVALID', component: 'TreeView', details: { id: item.id, parentId } });
      seen.add(item.id);
      result.push({ id: item.id, textValue: item.textValue ?? item.id, disabled: item.disabled, parentId, depth, posInSet: index + 1, setSize: nodes.length, expandable: Boolean(item.hasChildren || item.children?.length) });
      visit(item.children ?? [], item.id, depth + 1, new Set(ancestors).add(item.id));
    });
  };
  visit(items, undefined, 1, new Set());
  createUIFnNavigationCollection(result);
  return result;
}
function visibleItems(all: readonly FlatTreeItem[], expanded: readonly string[]): readonly FlatTreeItem[] {
  const open = new Set(expanded); const byId = new Map(all.map((item) => [item.id, item]));
  return all.filter((item) => { let parent = item.parentId; while (parent) { if (!open.has(parent)) return false; parent = byId.get(parent)?.parentId; } return true; });
}
function replaceChildren(items: readonly TreeViewItem[], id: string, children: readonly TreeViewItem[]): readonly TreeViewItem[] {
  return items.map((item) => item.id === id ? { ...item, children, hasChildren: children.length > 0 } : { ...item, children: item.children ? replaceChildren(item.children, id, children) : item.children });
}
function workflowStatuses(items: readonly TreeViewItem[], previous: Readonly<Record<string, TreeViewWorkflowStatus>> = {}): Readonly<Record<string, TreeViewWorkflowStatus>> {
  const result: Record<string, TreeViewWorkflowStatus> = {};
  const visit = (nodes: readonly TreeViewItem[]) => nodes.forEach((item) => { result[item.id] = item.status ?? previous[item.id] ?? 'pending'; visit(item.children ?? []); });
  visit(items); return Object.freeze(result);
}

export function createTreeViewController(props: TreeViewProps, env: UIFnEnvironment = {}): TreeViewController {
  const resolvedEnv = createUIFnEnvironment(env); const ids = createUIFnNavigationIds('TreeView', 'tree-view', resolvedEnv);
  const all = flattenAll(props.items); const allKeys = new Set(all.map((item) => item.id));
  const expanded = createControlledValue<readonly string[]>({ value: props.expanded, defaultValue: normalizeKeys(props.defaultExpanded ?? []).filter((id) => allKeys.has(id)), onChange: props.onExpandedChange, isEqual: sameArray });
  const selection = createControlledValue<readonly string[]>({ value: props.selection, defaultValue: normalizeKeys(props.defaultSelection ?? []).filter((id) => allKeys.has(id)), onChange: props.onSelectionChange, isEqual: sameArray });
  const initialVisible = visibleItems(all, expanded.getValue());
  const store = createStateChannel<TreeViewState, readonly string[]>({
    items: [...props.items], expanded: expanded.getValue(), expandedControlled: expanded.isControlled(), selection: selection.getValue(), selectionControlled: selection.isControlled(),
    selectionMode: props.selectionMode ?? 'single', focusedItem: createUIFnNavigationCollection(initialVisible).enabledKeys[0] ?? null, visibleItems: initialVisible,
    loading: [], statuses: workflowStatuses(props.items), dir: props.dir ?? resolvedEnv.getDirection(), loop: props.loop ?? false, typeahead: EMPTY_UIFN_TYPEAHEAD,
    requestedExpandedRepair: null, requestedSelectionRepair: null,
  });
  const changeExpanded = (next: readonly string[], source: ChangeMeta<readonly string[]>['source'], reason: string) => {
    const state = store.getState(); const normalized = normalizeKeys(next); const result = source === 'controlled-sync' ? expanded.syncValue(normalized) : expanded.requestValue(normalized);
    const nextVisible = visibleItems(flattenAll(state.items), result.value); const focusedItem = repairUIFnNavigationKey(state.visibleItems, nextVisible, state.focusedItem);
    const meta: ChangeMeta<readonly string[]> = { source, reason, previousValue: state.expanded, nextValue: normalized };
    store.patchState({ expanded: result.value, visibleItems: nextVisible, focusedItem, requestedExpandedRepair: null, lastChangeMeta: meta }, meta);
  };
  const changeSelection = (next: readonly string[], source: ChangeMeta<readonly string[]>['source'], reason: string) => {
    const state = store.getState(); const normalized = normalizeKeys(next); const result = source === 'controlled-sync' ? selection.syncValue(normalized) : selection.requestValue(normalized);
    const meta: ChangeMeta<readonly string[]> = { source, reason, previousValue: state.selection, nextValue: normalized };
    store.patchState({ selection: result.value, requestedSelectionRepair: null, lastChangeMeta: meta }, meta);
  };
  const actions: TreeViewActions = {
    setItems(nextItems) {
      const state = store.getState(); const nextAll = flattenAll(nextItems); const valid = new Set(nextAll.map((item) => item.id));
      const repairedExpanded = state.expanded.filter((id) => valid.has(id)); const repairedSelection = state.selection.filter((id) => valid.has(id));
      const expandedResult = sameArray(repairedExpanded, state.expanded) ? state.expanded : expanded.requestValue(repairedExpanded).value;
      const selectionResult = sameArray(repairedSelection, state.selection) ? state.selection : selection.requestValue(repairedSelection).value;
      const nextVisible = visibleItems(nextAll, expandedResult); const focusedItem = repairUIFnNavigationKey(state.visibleItems, nextVisible, state.focusedItem);
      store.patchState({ items: [...nextItems], expanded: expandedResult, selection: selectionResult, visibleItems: nextVisible, focusedItem, statuses: workflowStatuses(nextItems, state.statuses),
        requestedExpandedRepair: expanded.isControlled() && !sameArray(repairedExpanded, state.expanded) ? repairedExpanded : null,
        requestedSelectionRepair: selection.isControlled() && !sameArray(repairedSelection, state.selection) ? repairedSelection : null });
    },
    focusItem(id) { if (createUIFnNavigationCollection(store.getState().visibleItems).enabledKeys.includes(id)) store.patchState({ focusedItem: id }); },
    handleKeyDown(key, currentItem) {
      const state = store.getState(); const current = currentItem ?? state.focusedItem;
      const command = resolveUIFnPrimitiveKey({ primitive: 'TreeView', orientation: 'vertical', direction: state.dir, region: 'tree' }, key);
      const item = state.visibleItems.find((entry) => entry.id === current);
      if (command === 'typeahead') {
        const typeahead = advanceUIFnNavigationTypeahead(state.visibleItems, { ...state.typeahead, matchedKey: current }, key, { now: resolvedEnv.now(), locale: props.locale ?? resolvedEnv.getLocale(), loop: state.loop });
        store.patchState({ typeahead, focusedItem: typeahead.matchedKey }); return typeahead.matchedKey;
      }
      if (command === 'select' && current) { actions.select(current, { toggle: true }); return current; }
      if (command === 'expand-or-child' && item) {
        if (item.expandable && !state.expanded.includes(item.id)) { actions.expand(item.id); return item.id; }
        const child = state.visibleItems.find((entry) => entry.parentId === item.id && !entry.disabled)?.id ?? item.id;
        actions.focusItem(child); return child;
      }
      if (command === 'collapse-or-parent' && item) {
        if (item.expandable && state.expanded.includes(item.id)) { actions.collapse(item.id); return item.id; }
        if (item.parentId) actions.focusItem(item.parentId); return item.parentId ?? item.id;
      }
      const next = moveUIFnNavigationKey(state.visibleItems, current, command, { orientation: 'vertical', direction: state.dir, loop: state.loop });
      if (next) actions.focusItem(next); return next;
    },
    expand(id) { const state = store.getState(); if (!flattenAll(state.items).some((item) => item.id === id && item.expandable) || state.expanded.includes(id)) return; changeExpanded([...state.expanded, id], 'programmatic', 'expand'); },
    collapse(id) { const state = store.getState(); if (!state.expanded.includes(id)) return; changeExpanded(state.expanded.filter((entry) => entry !== id), 'programmatic', 'collapse'); },
    toggleExpanded(id) { store.getState().expanded.includes(id) ? actions.collapse(id) : actions.expand(id); },
    syncExpanded: (next) => changeExpanded(next, 'controlled-sync', 'controlled-expanded-sync'),
    select(id, options = {}) {
      const state = store.getState(); if (state.selectionMode === 'none') return;
      const item = flattenAll(state.items).find((entry) => entry.id === id); if (!item || item.disabled) return;
      const selected = state.selection.includes(id);
      const next = state.selectionMode === 'single' ? (selected && options.toggle ? [] : [id]) : selected && options.toggle ? state.selection.filter((entry) => entry !== id) : [...state.selection, id];
      changeSelection(next, 'programmatic', 'select');
    },
    syncSelection: (next) => changeSelection(next, 'controlled-sync', 'controlled-selection-sync'),
    startLoading(id) { const state = store.getState(); if (!state.loading.includes(id)) store.patchState({ loading: [...state.loading, id], statuses: Object.freeze({ ...state.statuses, [id]: 'pending' }) }); },
    finishLoading(id, children) { const state = store.getState(); store.patchState({ loading: state.loading.filter((entry) => entry !== id), statuses: Object.freeze({ ...state.statuses, [id]: 'complete' }) }); actions.setItems(replaceChildren(state.items, id, children)); },
    setStatus(id, status) { const state = store.getState(); if (flattenAll(state.items).some((item) => item.id === id)) store.patchState({ statuses: Object.freeze({ ...state.statuses, [id]: status }) }); },
  };
  const valuePart = (name: string, generated: (state: TreeViewState, item: string) => UIFnPartProps): ValuePart => ({ name, getProps(item, userProps) { return mergePartProps(generated(store.getState(), item), userProps, { component: 'TreeView', part: name, required: { id: true } }); } });
  const parts: TreeViewControllerParts = {
    root: { name: 'root', getProps(userProps) { return mergePartProps({ id: ids.rootId, data: { dir: store.getState().dir } }, userProps, { component: 'TreeView', part: 'root', required: { id: true } }); } },
    label: { name: 'label', getProps(userProps) { return mergePartProps({ id: ids.id('label') }, userProps, { component: 'TreeView', part: 'label', required: { id: true } }); } },
    tree: { name: 'tree', getProps(userProps) { const state = store.getState(); return mergePartProps({ role: 'tree', id: ids.id('tree'), tabIndex: state.focusedItem ? -1 : 0, aria: { labelledby: ids.id('label'), multiselectable: state.selectionMode === 'multiple' }, data: { selectionMode: state.selectionMode }, on: { keydown: (event) => {
      const next = actions.handleKeyDown(event?.key ?? '');
      if (next) focusUIFnPart(event, ids.id('item', next), { deferred: true });
    } } }, userProps, { component: 'TreeView', part: 'tree', required: { role: true, id: true, aria: ['labelledby'] } }); } },
    item: valuePart('item', (state, item) => { const node = state.visibleItems.find((entry) => entry.id === item); const selected = state.selection.includes(item); const expandedValue = node?.expandable ? state.expanded.includes(item) : undefined; const workflow = state.statuses[item] ?? 'pending'; return { role: 'treeitem', id: ids.id('item', item), tabIndex: state.focusedItem === item ? 0 : -1, aria: { selected: state.selectionMode === 'none' ? undefined : selected, expanded: expandedValue, disabled: node?.disabled ?? false, current: workflow === 'current' ? 'step' : undefined, invalid: workflow === 'error' ? true : undefined, level: node?.depth, posinset: node?.posInSet, setsize: node?.setSize }, data: { selected, state: expandedValue === undefined ? 'leaf' : expandedValue ? 'open' : 'closed', status: workflow, loading: state.loading.includes(item) }, disabled: node?.disabled ?? false, on: { focus: () => actions.focusItem(item), click: () => actions.select(item, { toggle: true }) } }; }),
    itemTrigger: valuePart('itemTrigger', (state, item) => ({ id: ids.id('trigger', item), tabIndex: -1, aria: { controls: ids.id('branch', item), expanded: state.expanded.includes(item) }, data: { state: state.expanded.includes(item) ? 'open' : 'closed' }, on: { click: () => actions.toggleExpanded(item) } })),
    itemText: valuePart('itemText', (_state, item) => ({ id: ids.id('text', item) })),
    branch: valuePart('branch', (state, item) => ({ role: 'group', id: ids.id('branch', item), aria: { labelledby: ids.id('text', item) }, data: { state: state.expanded.includes(item) ? 'open' : 'closed' }, hidden: !state.expanded.includes(item) })),
    indicator: valuePart('indicator', (state, item) => ({ id: ids.id('indicator', item), aria: { hidden: true }, data: { state: state.expanded.includes(item) ? 'open' : 'closed' }, hidden: !state.visibleItems.find((entry) => entry.id === item)?.expandable })),
  };
  return createUIFnController({ actions, parts, getState: store.getState, subscribe: store.subscribe, now: resolvedEnv.now,
    update(inputs) { if (inputs.items !== undefined) actions.setItems(inputs.items); if ('expanded' in inputs && inputs.expanded !== undefined) actions.syncExpanded(inputs.expanded); if ('selection' in inputs && inputs.selection !== undefined) actions.syncSelection(inputs.selection); },
    destroy() { expanded.destroy(); selection.destroy(); store.destroy(); },
  });
}
