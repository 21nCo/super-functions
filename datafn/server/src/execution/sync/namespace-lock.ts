class AsyncMutex {
  private tail: Promise<void> = Promise.resolve();
  private pendingCount = 0;

  async runExclusive<T>(task: () => Promise<T>): Promise<T> {
    this.pendingCount += 1;
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous.catch(() => undefined);

    try {
      return await task();
    } finally {
      this.pendingCount -= 1;
      release();
    }
  }

  isIdle(): boolean {
    return this.pendingCount === 0;
  }
}

const adapterNamespaceMutexes = new WeakMap<object, Map<string, AsyncMutex>>();

function getNamespaceMutexes(adapter: object): Map<string, AsyncMutex> {
  let namespaceMutexes = adapterNamespaceMutexes.get(adapter);
  if (!namespaceMutexes) {
    namespaceMutexes = new Map<string, AsyncMutex>();
    adapterNamespaceMutexes.set(adapter, namespaceMutexes);
  }

  return namespaceMutexes;
}

function getMutex(namespaceMutexes: Map<string, AsyncMutex>, namespace: string): AsyncMutex {
  let mutex = namespaceMutexes.get(namespace);
  if (!mutex) {
    mutex = new AsyncMutex();
    namespaceMutexes.set(namespace, mutex);
  }

  return mutex;
}

export function withAdapterNamespaceLock<T>(
  adapter: object,
  namespace: string,
  task: () => Promise<T>,
): Promise<T> {
  const namespaceMutexes = getNamespaceMutexes(adapter);
  const mutex = getMutex(namespaceMutexes, namespace);

  return mutex.runExclusive(task).finally(() => {
    if (!mutex.isIdle()) {
      return;
    }
    if (namespaceMutexes.get(namespace) !== mutex) {
      return;
    }
    namespaceMutexes.delete(namespace);
    if (namespaceMutexes.size === 0) {
      adapterNamespaceMutexes.delete(adapter);
    }
  });
}
