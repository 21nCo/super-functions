export interface VirtualWindow {
  readonly start: number;
  readonly end: number;
  readonly offset: number;
  readonly totalSize: number;
}

export interface VirtualizerContract {
  readonly count: number;
  readonly estimateSize: number;
  readonly overscan: number;
  getWindow(scrollOffset: number, viewportSize: number): VirtualWindow;
  getIndexAtOffset(offset: number): number;
  getOffsetForIndex(index: number): number;
}

export function createVirtualizerContract(options: {
  readonly count: number;
  readonly estimateSize: number;
  readonly overscan?: number;
}): VirtualizerContract {
  const count = Math.max(0, Math.floor(options.count));
  const estimateSize = Math.max(Number.EPSILON, options.estimateSize);
  const overscan = Math.max(0, Math.floor(options.overscan ?? 2));
  const getIndexAtOffset = (offset: number) => Math.max(0, Math.min(count - 1, Math.floor(Math.max(0, offset) / estimateSize)));
  return Object.freeze({
    count,
    estimateSize,
    overscan,
    getIndexAtOffset,
    getOffsetForIndex: (index: number) => Math.max(0, Math.min(count, Math.floor(index))) * estimateSize,
    getWindow(scrollOffset: number, viewportSize: number) {
      if (count === 0) return Object.freeze({ start: 0, end: -1, offset: 0, totalSize: 0 });
      const start = Math.max(0, getIndexAtOffset(scrollOffset) - overscan);
      const visible = Math.max(1, Math.ceil(Math.max(0, viewportSize) / estimateSize));
      const end = Math.min(count - 1, start + visible + overscan * 2 - 1);
      return Object.freeze({ start, end, offset: start * estimateSize, totalSize: count * estimateSize });
    },
  });
}
