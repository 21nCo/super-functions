import type { CacheEntry, CacheOptions, CacheStatistics } from "./types";

interface Node<TValue> {
  entry: CacheEntry<TValue>;
  prev?: Node<TValue>;
  next?: Node<TValue>;
}

export class LruCache<TValue> {
  private readonly options: CacheOptions;
  private map = new Map<string, Node<TValue>>();
  private head?: Node<TValue>;
  private tail?: Node<TValue>;
  private stats: CacheStatistics = {
    size: 0,
    hits: 0,
    misses: 0,
    evictions: 0
  };

  constructor(options: CacheOptions) {
    if (options.maxEntries <= 0) {
      throw new Error("maxEntries must be greater than zero");
    }
    this.options = options;
  }

  get(key: string): TValue | undefined {
    const node = this.map.get(key);
    if (!node) {
      this.stats.misses += 1;
      return undefined;
    }

    this.stats.hits += 1;
    node.entry.lastAccessedAt = Date.now();
    node.entry.accessCount += 1;
    this.moveToFront(node);
    return node.entry.value;
  }

  set(key: string, value: TValue): void {
    const existing = this.map.get(key);
    const now = Date.now();

    if (existing) {
      existing.entry.value = value;
      existing.entry.lastAccessedAt = now;
      existing.entry.accessCount += 1;
      this.moveToFront(existing);
      return;
    }

    const entry: CacheEntry<TValue> = {
      key,
      value,
      createdAt: now,
      lastAccessedAt: now,
      accessCount: 1
    };
    const node: Node<TValue> = { entry };
    this.map.set(key, node);
    this.addToFront(node);
    this.stats.size = this.map.size;

    if (this.map.size > this.options.maxEntries) {
      this.evictLeastRecentlyUsed();
    }
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  delete(key: string): boolean {
    const node = this.map.get(key);
    if (!node) return false;
    this.removeNode(node);
    this.map.delete(key);
    this.stats.size = this.map.size;
    return true;
  }

  clear(): void {
    this.map.clear();
    this.head = undefined;
    this.tail = undefined;
    this.stats = {
      size: 0,
      hits: 0,
      misses: 0,
      evictions: 0
    };
  }

  getStatistics(): CacheStatistics {
    return { ...this.stats, size: this.map.size };
  }

  private addToFront(node: Node<TValue>): void {
    if (!this.head) {
      this.head = node;
      this.tail = node;
      return;
    }
    node.next = this.head;
    this.head.prev = node;
    this.head = node;
  }

  private moveToFront(node: Node<TValue>): void {
    if (node === this.head) return;
    this.removeNode(node);
    this.addToFront(node);
  }

  private removeNode(node: Node<TValue>): void {
    if (node.prev) {
      node.prev.next = node.next;
    }
    if (node.next) {
      node.next.prev = node.prev;
    }
    if (node === this.head) {
      this.head = node.next;
    }
    if (node === this.tail) {
      this.tail = node.prev;
    }
    node.prev = undefined;
    node.next = undefined;
  }

  private evictLeastRecentlyUsed(): void {
    const lru = this.tail;
    if (!lru) return;
    this.removeNode(lru);
    this.map.delete(lru.entry.key);
    this.stats.evictions += 1;
    this.stats.size = this.map.size;
  }
}
