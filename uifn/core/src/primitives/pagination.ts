import { createUIFnController, type UIFnController } from '../controller';
import { createUIFnEnvironment, type UIFnEnvironment } from '../environment';
import { createUIFnError } from '../errors';
import { createControlledValue } from '../internal/runtime/controlled';
import { createStateChannel } from '../internal/runtime/state-channel';
import { mergePartProps, type UIFnPartProps } from '../parts';
import type { ChangeMeta } from './shared';
import { createUIFnNavigationIds, resolveUIFnPrimitiveKey } from './navigation';

export interface PaginationProps {
  readonly page?: number;
  readonly defaultPage?: number;
  readonly onPageChange?: (page: number) => void;
  readonly count: number;
  readonly pageSize?: number;
  readonly siblingCount?: number;
  readonly disabled?: boolean;
  readonly dir?: 'ltr' | 'rtl';
  readonly ariaLabel?: string;
  readonly getPageLabel?: (page: number, selected: boolean) => string;
  readonly previousLabel?: string;
  readonly nextLabel?: string;
}

export type PaginationToken = number | 'ellipsis-start' | 'ellipsis-end';
export interface PaginationState {
  readonly page: number;
  readonly controlled: boolean;
  readonly count: number;
  readonly pageSize: number;
  readonly siblingCount: number;
  readonly pageCount: number;
  readonly tokens: readonly PaginationToken[];
  readonly focusedPage: number;
  readonly disabled: boolean;
  readonly dir: 'ltr' | 'rtl';
  readonly lastChangeMeta?: ChangeMeta<number>;
}
export interface PaginationActions {
  setPage(page: number): void;
  syncPage(page: number): void;
  setCount(count: number): void;
  first(): void;
  previous(): void;
  next(): void;
  last(): void;
  focusPage(page: number): void;
  handleKeyDown(key: string): number;
}
type StaticPart = { readonly name: string; getProps(userProps?: UIFnPartProps): UIFnPartProps };
type PagePart = { readonly name: string; getProps(page: number, userProps?: UIFnPartProps): UIFnPartProps };
type EllipsisPart = { readonly name: string; getProps(position: 'start' | 'end', userProps?: UIFnPartProps): UIFnPartProps };
export interface PaginationControllerParts {
  readonly root: StaticPart;
  readonly list: StaticPart;
  readonly item: PagePart;
  readonly pageTrigger: PagePart;
  readonly previous: StaticPart;
  readonly next: StaticPart;
  readonly ellipsis: EllipsisPart;
}
export type PaginationController = UIFnController<PaginationState, PaginationActions, PaginationControllerParts, PaginationProps>;

function normalizeCount(count: number): number {
  if (!Number.isFinite(count) || count < 0) throw createUIFnError({ code: 'UIFN_NAVIGATION_COLLECTION_INVALID', component: 'Pagination', details: { count } });
  return Math.floor(count);
}
function pageCount(count: number, pageSize: number): number { return Math.max(1, Math.ceil(count / pageSize)); }
function clampPage(page: number, total: number): number {
  if (!Number.isFinite(page)) {
    throw createUIFnError({
      code: 'UIFN_ERR_INVALID_VALUE',
      component: 'Pagination',
      message: 'Pagination page MUST be a finite number.',
      details: { page: String(page) },
    });
  }
  return Math.max(1, Math.min(total, Math.floor(page || 1)));
}
function paginationTokens(page: number, total: number, siblingCount: number): readonly PaginationToken[] {
  if (total <= siblingCount * 2 + 5) return Object.freeze(Array.from({ length: total }, (_, index) => index + 1));
  const values = new Set<number>([1, total]);
  for (let value = Math.max(2, page - siblingCount); value <= Math.min(total - 1, page + siblingCount); value += 1) values.add(value);
  const sorted = [...values].sort((a, b) => a - b);
  const result: PaginationToken[] = [];
  sorted.forEach((value, index) => {
    const previous = sorted[index - 1];
    if (previous !== undefined && value - previous > 1) result.push(previous === 1 ? 'ellipsis-start' : 'ellipsis-end');
    result.push(value);
  });
  return Object.freeze(result);
}

export function createPaginationController(props: PaginationProps, env: UIFnEnvironment = {}): PaginationController {
  const resolvedEnv = createUIFnEnvironment(env);
  const ids = createUIFnNavigationIds('Pagination', 'pagination', resolvedEnv);
  const count = normalizeCount(props.count);
  const size = Math.max(1, Math.floor(props.pageSize ?? 10));
  const total = pageCount(count, size);
  if (props.page !== undefined) clampPage(props.page, total);
  if (props.defaultPage !== undefined) clampPage(props.defaultPage, total);
  const controlled = createControlledValue({ value: props.page, defaultValue: clampPage(props.defaultPage ?? 1, total), onChange: props.onPageChange });
  const initial = clampPage(controlled.getValue(), total);
  if (initial !== controlled.getValue()) controlled.syncValue(initial);
  const siblingCount = Math.max(0, Math.floor(props.siblingCount ?? 1));
  const store = createStateChannel<PaginationState, number>({
    page: initial, controlled: controlled.isControlled(), count, pageSize: size, siblingCount, pageCount: total,
    tokens: paginationTokens(initial, total, siblingCount), focusedPage: initial, disabled: props.disabled ?? false,
    dir: props.dir ?? resolvedEnv.getDirection(),
  });
  const changePage = (nextPage: number, source: ChangeMeta<number>['source'], reason: string) => {
    const state = store.getState();
    if (state.disabled && source !== 'controlled-sync') return;
    const next = clampPage(nextPage, state.pageCount);
    const result = source === 'controlled-sync' ? controlled.syncValue(next) : controlled.requestValue(next);
    const meta: ChangeMeta<number> = { source, reason, previousValue: state.page, nextValue: next };
    store.patchState({ page: result.value, focusedPage: next, tokens: paginationTokens(result.value, state.pageCount, state.siblingCount), lastChangeMeta: meta }, meta);
  };
  const actions: PaginationActions = {
    setPage: (page) => changePage(page, 'programmatic', 'go-to'),
    syncPage: (page) => changePage(page, 'controlled-sync', 'controlled-page-sync'),
    setCount(nextCount) {
      const state = store.getState(); const countValue = normalizeCount(nextCount); const totalValue = pageCount(countValue, state.pageSize);
      const repaired = clampPage(state.page, totalValue);
      if (repaired !== state.page) controlled.requestValue(repaired);
      const current = controlled.getValue();
      store.patchState({ count: countValue, pageCount: totalValue, page: current, focusedPage: clampPage(state.focusedPage, totalValue), tokens: paginationTokens(current, totalValue, state.siblingCount) });
    },
    first: () => actions.setPage(1), previous: () => actions.setPage(store.getState().page - 1),
    next: () => actions.setPage(store.getState().page + 1), last: () => actions.setPage(store.getState().pageCount),
    focusPage(page) { store.patchState({ focusedPage: clampPage(page, store.getState().pageCount) }); },
    handleKeyDown(key) {
      const state = store.getState();
      const command = resolveUIFnPrimitiveKey({ primitive: 'Pagination', orientation: 'horizontal', direction: state.dir, region: 'root' }, key);
      if (command === 'first') actions.first(); else if (command === 'last') actions.last();
      else if (command === 'page-next') actions.next(); else if (command === 'page-previous') actions.previous();
      else if (command === 'activate') actions.setPage(state.focusedPage);
      return store.getState().page;
    },
  };
  const pagePart = (name: string, generated: (state: PaginationState, page: number) => UIFnPartProps): PagePart => ({ name, getProps(page, userProps) { return mergePartProps(generated(store.getState(), page), userProps, { component: 'Pagination', part: name, required: { id: true } }); } });
  const parts: PaginationControllerParts = {
    root: { name: 'root', getProps(userProps) { const state = store.getState(); return mergePartProps({ role: 'navigation', id: ids.rootId, aria: { label: props.ariaLabel }, data: { disabled: state.disabled }, on: { keydown: (event) => actions.handleKeyDown(event?.key ?? '') } }, userProps, { component: 'Pagination', part: 'root', required: { role: true, id: true } }); } },
    list: { name: 'list', getProps(userProps) { return mergePartProps({ role: 'list', id: ids.id('list') }, userProps, { component: 'Pagination', part: 'list', required: { role: true, id: true } }); } },
    item: pagePart('item', (_state, page) => ({ role: 'listitem', id: ids.id('item', String(page)), data: { page } })),
    pageTrigger: pagePart('pageTrigger', (state, page) => { const selected = state.page === page; return { id: ids.id('page', String(page)), tabIndex: state.focusedPage === page ? 0 : -1, aria: { current: selected ? 'page' : undefined, label: props.getPageLabel?.(page, selected), disabled: state.disabled }, data: { selected, page }, disabled: state.disabled, on: { focus: () => actions.focusPage(page), click: () => actions.setPage(page), keydown: (event) => actions.handleKeyDown(event?.key ?? '') } }; }),
    previous: { name: 'previous', getProps(userProps) { const state = store.getState(); const disabled = state.disabled || state.page <= 1; return mergePartProps({ id: ids.id('previous'), aria: { label: props.previousLabel, disabled }, disabled, on: { click: () => actions.previous() } }, userProps, { component: 'Pagination', part: 'previous', required: { id: true } }); } },
    next: { name: 'next', getProps(userProps) { const state = store.getState(); const disabled = state.disabled || state.page >= state.pageCount; return mergePartProps({ id: ids.id('next'), aria: { label: props.nextLabel, disabled }, disabled, on: { click: () => actions.next() } }, userProps, { component: 'Pagination', part: 'next', required: { id: true } }); } },
    ellipsis: { name: 'ellipsis', getProps(position, userProps) { return mergePartProps({ id: ids.id('ellipsis', position), aria: { hidden: true }, data: { position } }, userProps, { component: 'Pagination', part: 'ellipsis', required: { id: true } }); } },
  };
  return createUIFnController({ actions, parts, getState: store.getState, subscribe: store.subscribe, now: resolvedEnv.now,
    update(inputs) { if ('page' in inputs && inputs.page !== undefined) actions.syncPage(inputs.page); if (inputs.count !== undefined) actions.setCount(inputs.count); },
    destroy() { controlled.destroy(); store.destroy(); },
  });
}
