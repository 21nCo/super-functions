export type LegacyAvatarStatus = 'idle' | 'loading' | 'loaded' | 'error';

export interface LegacyAvatarState {
  readonly status: LegacyAvatarStatus;
}

export interface LegacyAvatarMachine {
  readonly state: LegacyAvatarState;
  readonly actions: Readonly<{
    setLoading(): void;
    setLoaded(): void;
    setError(): void;
  }>;
  subscribe(callback: (state: LegacyAvatarState) => void): () => void;
}

/** Compatibility factory for the pre-controller Svelte adapter. */
export function createLegacyAvatar(): LegacyAvatarMachine {
  let state: LegacyAvatarState = Object.freeze({ status: 'idle' });
  const subscribers = new Set<(state: LegacyAvatarState) => void>();
  const update = (status: LegacyAvatarStatus) => {
    state = Object.freeze({ status });
    for (const subscriber of [...subscribers]) subscriber(state);
  };

  return {
    get state() {
      return state;
    },
    actions: Object.freeze({
      setLoading: () => update('loading'),
      setLoaded: () => update('loaded'),
      setError: () => update('error'),
    }),
    subscribe(callback) {
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    },
  };
}
