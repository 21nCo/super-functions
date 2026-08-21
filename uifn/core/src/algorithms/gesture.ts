import { createUIFnError } from '../errors';
import { alignRangeValue, clampRangeValue, type RangeDefinition } from './range';

export type UIFnAxis = 'horizontal' | 'vertical';
export type UIFnGestureDirection = 'ltr' | 'rtl';
export type UIFnPointerKind = 'mouse' | 'pen' | 'touch';
export type UIFnTouchArbitration = 'pending' | 'gesture' | 'scroll';

export interface UIFnPoint { readonly x: number; readonly y: number }
export interface UIFnRect { readonly left: number; readonly top: number; readonly width: number; readonly height: number }
export interface UIFnGesturePointer {
  readonly id: number;
  readonly kind: UIFnPointerKind;
  readonly start: UIFnPoint;
  readonly current: UIFnPoint;
  readonly arbitration: UIFnTouchArbitration;
}

export function resolveUIFnAxisPercent(
  point: UIFnPoint,
  rect: UIFnRect,
  orientation: UIFnAxis,
  direction: UIFnGestureDirection = 'ltr',
): number {
  const width = Math.max(Number.EPSILON, rect.width);
  const height = Math.max(Number.EPSILON, rect.height);
  if (orientation === 'vertical') return clampRangeValue((rect.top + height - point.y) / height * 100, 0, 100);
  const physical = clampRangeValue((point.x - rect.left) / width * 100, 0, 100);
  return direction === 'rtl' ? 100 - physical : physical;
}

export function resolveUIFnTouchArbitration(
  start: UIFnPoint,
  current: UIFnPoint,
  orientation: UIFnAxis,
  threshold = 6,
): UIFnTouchArbitration {
  const primary = orientation === 'horizontal' ? Math.abs(current.x - start.x) : Math.abs(current.y - start.y);
  const cross = orientation === 'horizontal' ? Math.abs(current.y - start.y) : Math.abs(current.x - start.x);
  if (Math.max(primary, cross) < threshold) return 'pending';
  return primary >= cross ? 'gesture' : 'scroll';
}

export function stepUIFnRangeValue(
  value: number,
  key: string,
  definition: RangeDefinition,
  options: { readonly orientation?: UIFnAxis; readonly direction?: UIFnGestureDirection; readonly pageStep?: number } = {},
): number {
  const orientation = options.orientation ?? 'horizontal';
  const direction = options.direction ?? 'ltr';
  const step = definition.step ?? 1;
  const pageStep = options.pageStep ?? step * 10;
  if (key === 'Home') return definition.min;
  if (key === 'End') return definition.max;
  if (key === 'PageUp') return alignRangeValue(value + pageStep, definition);
  if (key === 'PageDown') return alignRangeValue(value - pageStep, definition);
  if (key === 'ArrowUp') return alignRangeValue(value + step, definition);
  if (key === 'ArrowDown') return alignRangeValue(value - step, definition);
  if (key === 'ArrowRight') {
    if (orientation === 'vertical') return alignRangeValue(value, definition);
    return alignRangeValue(value + step * (direction === 'rtl' ? -1 : 1), definition);
  }
  if (key === 'ArrowLeft') {
    if (orientation === 'vertical') return alignRangeValue(value, definition);
    return alignRangeValue(value - step * (direction === 'rtl' ? -1 : 1), definition);
  }
  return alignRangeValue(value, definition);
}

export function constrainUIFnThumbValue(
  values: readonly number[],
  index: number,
  rawValue: number,
  definition: RangeDefinition,
  minStepsBetweenThumbs = 0,
): readonly number[] {
  if (!Number.isInteger(index) || index < 0 || index >= values.length) return values;
  const gap = Math.max(0, minStepsBetweenThumbs) * (definition.step ?? 1);
  const lower = index === 0 ? definition.min : values[index - 1] + gap;
  const upper = index === values.length - 1 ? definition.max : values[index + 1] - gap;
  const next = [...values];
  next[index] = alignRangeValue(clampRangeValue(rawValue, lower, upper), definition);
  return Object.freeze(next);
}

export function closestUIFnThumb(values: readonly number[], value: number): number {
  let closest = 0;
  let distance = Number.POSITIVE_INFINITY;
  values.forEach((candidate, index) => {
    const nextDistance = Math.abs(candidate - value);
    if (nextDistance < distance) { closest = index; distance = nextDistance; }
  });
  return closest;
}

export function resolveUIFnAngle(point: UIFnPoint, center: UIFnPoint, definition: RangeDefinition): number {
  const radians = Math.atan2(point.y - center.y, point.x - center.x);
  const degrees = (radians * 180 / Math.PI + 450) % 360;
  const span = definition.max - definition.min;
  return alignRangeValue(definition.min + degrees / 360 * span, definition);
}

export function resolveUIFnCarouselIndex(index: number, count: number, loop: boolean): number {
  if (count <= 0) return 0;
  if (loop) return ((Math.trunc(index) % count) + count) % count;
  return clampRangeValue(Math.trunc(index), 0, count - 1);
}

export function resizeUIFnSplitterPair(
  sizes: readonly number[],
  index: number,
  delta: number,
  minSizes: readonly number[],
  maxSizes: readonly number[],
): readonly number[] {
  if (index < 0 || index >= sizes.length - 1) return sizes;
  const total = sizes[index] + sizes[index + 1];
  const firstMin = minSizes[index] ?? 0;
  const secondMin = minSizes[index + 1] ?? 0;
  const firstMax = Math.min(maxSizes[index] ?? 100, total - secondMin);
  const secondMax = Math.min(maxSizes[index + 1] ?? 100, total - firstMin);
  const first = clampRangeValue(sizes[index] + delta, Math.max(firstMin, total - secondMax), firstMax);
  const next = [...sizes];
  next[index] = Number(first.toFixed(6));
  next[index + 1] = Number((total - first).toFixed(6));
  return Object.freeze(next);
}

export function assertUIFnGestureInactive(active: boolean, details: Record<string, unknown> = {}): void {
  if (!active) return;
  throw createUIFnError({ code: 'UIFN_GESTURE_AFTER_CANCEL', component: 'Gesture', details });
}

export function assertUIFnRangeDirection(actual: number, expected: number, details: Record<string, unknown> = {}): void {
  if (Object.is(actual, expected)) return;
  throw createUIFnError({ code: 'UIFN_RANGE_DIRECTION_INVALID', component: 'Range', details: { ...details, actual, expected } });
}
