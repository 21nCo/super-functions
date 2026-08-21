export interface AsyncListState<T> {
  readonly status: 'idle' | 'loading' | 'loaded' | 'error';
  readonly items: readonly T[];
  readonly error: unknown;
  readonly requestId: number;
}

export interface AsyncListLoadContext {
  readonly signal: AbortSignal;
  readonly filterText: string;
}

export interface AsyncList<T> {
  readonly state: AsyncListState<T>;
  load(filterText?: string): Promise<AsyncListState<T>>;
  cancel(): void;
  subscribe(callback: (state: AsyncListState<T>) => void): () => void;
  destroy(): void;
}

export function createAsyncList<T>(options: {
  readonly load: (context: AsyncListLoadContext) => Promise<readonly T[]>;
  readonly initialItems?: readonly T[];
}): AsyncList<T> {
  let state: AsyncListState<T> = Object.freeze({ status: 'idle', items: Object.freeze([...(options.initialItems ?? [])]), error: null, requestId: 0 });
  let controller: AbortController | null = null;
  let destroyed = false;
  const listeners = new Set<(state: AsyncListState<T>) => void>();
  const publish = (next: AsyncListState<T>) => {
    state = Object.freeze(next);
    listeners.forEach((listener) => listener(state));
  };
  const api: AsyncList<T> = {
    get state() { return state; },
    async load(filterText = '') {
      if (destroyed) return state;
      controller?.abort();
      controller = new AbortController();
      const requestId = state.requestId + 1;
      const active = controller;
      publish({ ...state, status: 'loading', error: null, requestId });
      try {
        const items = await options.load({ signal: active.signal, filterText });
        if (!destroyed && !active.signal.aborted && requestId === state.requestId) {
          publish({ status: 'loaded', items: Object.freeze([...items]), error: null, requestId });
        }
      } catch (error) {
        if (!destroyed && !active.signal.aborted && requestId === state.requestId) {
          publish({ ...state, status: 'error', error, requestId });
        }
      }
      return state;
    },
    cancel() { controller?.abort(); },
    subscribe(callback) {
      if (destroyed) return () => undefined;
      listeners.add(callback);
      callback(state);
      return () => listeners.delete(callback);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      controller?.abort();
      listeners.clear();
    },
  };
  return api;
}
