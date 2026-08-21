import { alignRangeValue, clampRangeValue } from '../algorithms/range';

export type ChangeSource = 'user' | 'programmatic' | 'controlled-sync';

export interface ChangeMeta<TValue = unknown> {
  source: ChangeSource;
  reason: string;
  previousValue: TValue;
  nextValue: TValue;
  inputModality?: 'keyboard' | 'pointer' | 'touch' | 'virtual';
}

export function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

export function clamp(value: number, min: number, max: number): number {
  return clampRangeValue(value, min, max);
}

export function alignToStep(value: number, min: number, step: number): number {
  if (step <= 0) return value;
  return alignRangeValue(value, { min, max: Number.MAX_SAFE_INTEGER, step });
}

export function shallowArrayEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) {
    return false;
  }

  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) {
      return false;
    }
  }

  return true;
}
