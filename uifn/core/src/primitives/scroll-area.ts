import { createStateChannel } from '../internal/runtime/state-channel';
import { createUIFnError, type UIFnError } from '../errors';
import { clamp, type ChangeMeta } from './shared';

export interface ScrollAreaProps {
  type?: 'auto' | 'always' | 'scroll' | 'hover';
  scrollHideDelay?: number;
  orientation?: 'vertical' | 'horizontal' | 'both';
  dir?: 'ltr' | 'rtl';
  ariaLabel?: string;
}

export interface ScrollMetrics {
  scrollTop: number;
  scrollLeft: number;
  scrollHeight: number;
  scrollWidth: number;
  clientHeight: number;
  clientWidth: number;
}

export interface ScrollAxisState {
  visible: boolean;
  thumbSizePercent: number;
  thumbPositionPercent: number;
}

export interface ScrollAreaState {
  status: 'idle' | 'scrolling' | 'dragging';
  type: 'auto' | 'always' | 'scroll' | 'hover';
  orientation: 'vertical' | 'horizontal' | 'both';
  dir: 'ltr' | 'rtl';
  scrollHideDelay: number;
  viewport: ScrollMetrics;
  vertical: ScrollAxisState;
  horizontal: ScrollAxisState;
  cornerVisible: boolean;
  lastInteraction: 'viewport' | 'vertical-thumb' | 'horizontal-thumb' | null;
  lastChangeMeta?: ChangeMeta<number>;
  lastError: UIFnError | null;
}

export interface ScrollAreaActions {
  setViewportMetrics: (metrics: Partial<ScrollMetrics>) => void;
  onViewportScroll: (position: { top?: number; left?: number }) => void;
  scrollTo: (position: { top?: number; left?: number }) => void;
  dragVerticalThumb: (positionPercent: number) => void;
  dragHorizontalThumb: (positionPercent: number) => void;
  handleKeyDown: (axis: 'vertical' | 'horizontal', key: string) => void;
  endInteraction: () => void;
}

export interface ScrollAreaRuntime {
  readonly state: ScrollAreaState;
  readonly actions: ScrollAreaActions;
  getState: () => ScrollAreaState;
  subscribe: (
    callback: (state: ScrollAreaState, meta?: ChangeMeta<number>) => void
  ) => () => void;
  destroy: () => void;
}

function createDefaultViewport(): ScrollMetrics {
  return {
    scrollTop: 0,
    scrollLeft: 0,
    scrollHeight: 0,
    scrollWidth: 0,
    clientHeight: 0,
    clientWidth: 0,
  };
}

function toAxisState(
  scrollSize: number,
  clientSize: number,
  scrollOffset: number
): ScrollAxisState {
  const visible = scrollSize > clientSize && clientSize > 0;
  if (!visible) {
    return {
      visible: false,
      thumbSizePercent: 100,
      thumbPositionPercent: 0,
    };
  }

  const maxScroll = Math.max(1, scrollSize - clientSize);
  const thumbSizePercent = clamp((clientSize / scrollSize) * 100, 5, 100);
  const thumbPositionPercent = clamp((scrollOffset / maxScroll) * 100, 0, 100);

  return {
    visible: true,
    thumbSizePercent,
    thumbPositionPercent,
  };
}

function resolveStateFromViewport(
  viewport: ScrollMetrics
): Pick<ScrollAreaState, 'vertical' | 'horizontal' | 'cornerVisible'> {
  const vertical = toAxisState(viewport.scrollHeight, viewport.clientHeight, viewport.scrollTop);
  const horizontal = toAxisState(viewport.scrollWidth, viewport.clientWidth, viewport.scrollLeft);

  return {
    vertical,
    horizontal,
    cornerVisible: vertical.visible && horizontal.visible,
  };
}

function toScrollOffset(positionPercent: number, scrollSize: number, clientSize: number): number {
  const maxScroll = Math.max(0, scrollSize - clientSize);
  if (maxScroll === 0) {
    return 0;
  }

  return (clamp(positionPercent, 0, 100) / 100) * maxScroll;
}

function clampViewport(viewport: ScrollMetrics): ScrollMetrics {
  return {
    ...viewport,
    scrollTop: clamp(
      viewport.scrollTop,
      0,
      Math.max(0, viewport.scrollHeight - viewport.clientHeight)
    ),
    scrollLeft: clamp(
      viewport.scrollLeft,
      0,
      Math.max(0, viewport.scrollWidth - viewport.clientWidth)
    ),
  };
}

export function createScrollAreaRuntime(props: ScrollAreaProps): ScrollAreaRuntime {
  const viewport = createDefaultViewport();
  const computed = resolveStateFromViewport(viewport);
  const store = createStateChannel<ScrollAreaState, number>({
    status: 'idle',
    type: props.type ?? 'hover',
    orientation: props.orientation ?? 'both',
    dir: props.dir ?? 'ltr',
    scrollHideDelay: props.scrollHideDelay ?? 600,
    viewport,
    vertical: computed.vertical,
    horizontal: computed.horizontal,
    cornerVisible: computed.cornerVisible,
    lastInteraction: null,
    lastError: null,
  });

  const actions: ScrollAreaActions = {
    setViewportMetrics(metrics) {
      const state = store.getState();
      const nextViewport = clampViewport({
        ...state.viewport,
        ...metrics,
      });
      const nextComputed = resolveStateFromViewport(nextViewport);
      store.patchState({
        viewport: nextViewport,
        vertical: nextComputed.vertical,
        horizontal: nextComputed.horizontal,
        cornerVisible: nextComputed.cornerVisible,
      });
    },
    onViewportScroll(position) {
      const state = store.getState();
      const nextViewport = clampViewport({
        ...state.viewport,
        scrollTop: position.top !== undefined ? position.top : state.viewport.scrollTop,
        scrollLeft: position.left !== undefined ? position.left : state.viewport.scrollLeft,
      });
      const nextComputed = resolveStateFromViewport(nextViewport);
      const meta: ChangeMeta<number> = {
        source: 'user',
        reason: 'viewport-scroll',
        previousValue: state.viewport.scrollTop,
        nextValue: nextViewport.scrollTop,
        inputModality: 'pointer',
      };
      store.patchState(
        {
          viewport: nextViewport,
          vertical: nextComputed.vertical,
          horizontal: nextComputed.horizontal,
          cornerVisible: nextComputed.cornerVisible,
          lastInteraction: 'viewport',
          status: 'scrolling',
          lastChangeMeta: meta,
          lastError: null,
        },
        meta
      );
    },
    scrollTo(position) {
      const state = store.getState();
      const nextViewport = clampViewport({
        ...state.viewport,
        scrollTop: position.top !== undefined ? position.top : state.viewport.scrollTop,
        scrollLeft: position.left !== undefined ? position.left : state.viewport.scrollLeft,
      });
      const nextComputed = resolveStateFromViewport(nextViewport);
      const meta: ChangeMeta<number> = {
        source: 'programmatic',
        reason: 'programmatic-scroll',
        previousValue: state.viewport.scrollTop,
        nextValue: nextViewport.scrollTop,
      };
      store.patchState(
        {
          viewport: nextViewport,
          vertical: nextComputed.vertical,
          horizontal: nextComputed.horizontal,
          cornerVisible: nextComputed.cornerVisible,
          lastInteraction: 'viewport',
          status: 'scrolling',
          lastChangeMeta: meta,
          lastError: null,
        },
        meta
      );
    },
    dragVerticalThumb(positionPercent) {
      const state = store.getState();
      if (!state.vertical.visible) {
        store.patchState({
          lastError: createUIFnError({
            code: 'UIFN_ERR_SCROLL_SYNC',
            package: '@uifn/core',
            component: 'ScrollArea',
            message: 'ScrollArea viewport and thumb state MUST remain synchronized.',
            recoverable: true,
          }),
        });
        return;
      }

      const nextScrollTop = toScrollOffset(
        positionPercent,
        state.viewport.scrollHeight,
        state.viewport.clientHeight
      );
      const nextViewport = clampViewport({
        ...state.viewport,
        scrollTop: nextScrollTop,
      });
      const nextComputed = resolveStateFromViewport(nextViewport);
      const meta: ChangeMeta<number> = {
        source: 'user',
        reason: 'vertical-thumb-drag',
        previousValue: state.viewport.scrollTop,
        nextValue: nextScrollTop,
        inputModality: 'pointer',
      };
      store.patchState(
        {
          viewport: nextViewport,
          vertical: {
            ...nextComputed.vertical,
            thumbPositionPercent: clamp(positionPercent, 0, 100),
          },
          horizontal: nextComputed.horizontal,
          cornerVisible: nextComputed.cornerVisible,
          lastInteraction: 'vertical-thumb',
          status: 'dragging',
          lastChangeMeta: meta,
          lastError: null,
        },
        meta
      );
    },
    dragHorizontalThumb(positionPercent) {
      const state = store.getState();
      if (!state.horizontal.visible) {
        store.patchState({
          lastError: createUIFnError({
            code: 'UIFN_ERR_SCROLL_SYNC',
            package: '@uifn/core',
            component: 'ScrollArea',
            message: 'ScrollArea viewport and thumb state MUST remain synchronized.',
            recoverable: true,
          }),
        });
        return;
      }

      const nextScrollLeft = toScrollOffset(
        positionPercent,
        state.viewport.scrollWidth,
        state.viewport.clientWidth
      );
      const nextViewport = clampViewport({
        ...state.viewport,
        scrollLeft: nextScrollLeft,
      });
      const nextComputed = resolveStateFromViewport(nextViewport);
      const meta: ChangeMeta<number> = {
        source: 'user',
        reason: 'horizontal-thumb-drag',
        previousValue: state.viewport.scrollLeft,
        nextValue: nextScrollLeft,
        inputModality: 'pointer',
      };
      store.patchState(
        {
          viewport: nextViewport,
          horizontal: {
            ...nextComputed.horizontal,
            thumbPositionPercent: clamp(positionPercent, 0, 100),
          },
          vertical: nextComputed.vertical,
          cornerVisible: nextComputed.cornerVisible,
          lastInteraction: 'horizontal-thumb',
          status: 'dragging',
          lastChangeMeta: meta,
          lastError: null,
        },
        meta
      );
    },
    handleKeyDown(axis, key) {
      const state = store.getState();
      const viewport = state.viewport;
      const current = axis === 'vertical' ? viewport.scrollTop : viewport.scrollLeft;
      const max = axis === 'vertical'
        ? Math.max(0, viewport.scrollHeight - viewport.clientHeight)
        : Math.max(0, viewport.scrollWidth - viewport.clientWidth);
      let next = current;
      if (key === 'Home') next = 0;
      else if (key === 'End') next = max;
      else if (key === 'PageUp') next -= axis === 'vertical' ? viewport.clientHeight : viewport.clientWidth;
      else if (key === 'PageDown') next += axis === 'vertical' ? viewport.clientHeight : viewport.clientWidth;
      else if (key === 'ArrowUp' || key === 'ArrowLeft') next -= 40;
      else if (key === 'ArrowDown' || key === 'ArrowRight') next += 40;
      else return;
      actions.scrollTo(axis === 'vertical' ? { top: next } : { left: next });
    },
    endInteraction() {
      store.patchState({ status: 'idle' });
    },
  };

  return {
    get state() {
      return store.getState();
    },
    actions,
    getState: store.getState,
    subscribe: store.subscribe,
    destroy: store.destroy,
  };
}
