export type AdapterCleanup = () => void;

export interface LifecycleScope {
  add: (cleanup: AdapterCleanup) => AdapterCleanup;
  run: <T>(createCleanup: () => T | AdapterCleanup) => T | AdapterCleanup;
  cleanup: () => void;
  active: () => boolean;
  size: () => number;
}

export function createLifecycleScope(): LifecycleScope {
  const cleanups = new Set<AdapterCleanup>();
  let isActive = true;

  const remove = (cleanup: AdapterCleanup) => {
    cleanups.delete(cleanup);
  };

  return {
    add(cleanup) {
      if (!isActive) {
        cleanup();
        return () => undefined;
      }

      cleanups.add(cleanup);
      return () => remove(cleanup);
    },
    run(createCleanup) {
      const cleanup = createCleanup();

      if (typeof cleanup === 'function') {
        this.add(cleanup as AdapterCleanup);
      }

      return cleanup;
    },
    cleanup() {
      if (!isActive) {
        return;
      }

      isActive = false;
      Array.from(cleanups)
        .reverse()
        .forEach((cleanup) => cleanup());
      cleanups.clear();
    },
    active() {
      return isActive;
    },
    size() {
      return cleanups.size;
    },
  };
}
