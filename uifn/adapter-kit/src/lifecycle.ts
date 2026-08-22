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
  const add = (cleanup: AdapterCleanup): AdapterCleanup => {
    if (!isActive) {
      cleanup();
      return () => undefined;
    }
    cleanups.add(cleanup);
    return () => remove(cleanup);
  };

  return {
    add,
    run(createCleanup) {
      const cleanup = createCleanup();

      if (typeof cleanup === 'function') {
        add(cleanup as AdapterCleanup);
      }

      return cleanup;
    },
    cleanup() {
      if (!isActive) {
        return;
      }

      isActive = false;
      const pending = Array.from(cleanups).reverse();
      cleanups.clear();
      const errors: unknown[] = [];
      pending.forEach((cleanup) => {
        try {
          cleanup();
        } catch (error) {
          errors.push(error);
        }
      });
      if (errors.length === 1) throw errors[0];
      if (errors.length > 1) throw new AggregateError(errors, 'Multiple adapter cleanup callbacks failed.');
    },
    active() {
      return isActive;
    },
    size() {
      return cleanups.size;
    },
  };
}
