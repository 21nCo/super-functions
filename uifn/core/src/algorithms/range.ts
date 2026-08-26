import { createUIFnError } from '../errors';

export interface RangeDefinition {
  readonly min: number;
  readonly max: number;
  readonly step?: number;
}

function decimals(value: number): number {
  const text = String(value).toLowerCase();
  if (text.includes('e-')) return Number(text.split('e-')[1]);
  return text.includes('.') ? text.length - text.indexOf('.') - 1 : 0;
}

export function clampRangeValue(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function alignRangeValue(value: number, definition: RangeDefinition): number {
  const { min, max } = definition;
  const step = definition.step ?? 1;
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || min > max || step <= 0) {
    throw createUIFnError({
      code: 'UIFN_ERR_RANGE_OUT_OF_BOUNDS',
      component: 'Range',
      message: 'Range values require finite bounds, min <= max, and a positive step.',
      details: { value, min, max, step },
    });
  }
  const precision = Math.min(12, Math.max(decimals(min), decimals(max), decimals(step)));
  const aligned = min + Math.round((clampRangeValue(value, min, max) - min) / step) * step;
  return clampRangeValue(Number(aligned.toFixed(precision)), min, max);
}

export function normalizeRangeValues(values: readonly number[], definition: RangeDefinition): number[] {
  const normalized = (values.length === 0 ? [definition.min] : values)
    .map((value) => alignRangeValue(value, definition))
    .sort((left, right) => left - right);
  return normalized;
}

export function rangeValueToPercent(value: number, definition: Pick<RangeDefinition, 'min' | 'max'>): number {
  if (definition.max === definition.min) return 0;
  return clampRangeValue(((value - definition.min) / (definition.max - definition.min)) * 100, 0, 100);
}

export function rangePercentToValue(percent: number, definition: RangeDefinition): number {
  return alignRangeValue(definition.min + clampRangeValue(percent, 0, 100) / 100 * (definition.max - definition.min), definition);
}

export function stepRangeValue(value: number, key: string, definition: RangeDefinition, direction: 'ltr' | 'rtl' = 'ltr'): number {
  const step = definition.step ?? 1;
  const rtl = direction === 'rtl' ? -1 : 1;
  if (key === 'Home') return definition.min;
  if (key === 'End') return definition.max;
  if (key === 'ArrowRight') return alignRangeValue(value + step * rtl, definition);
  if (key === 'ArrowLeft') return alignRangeValue(value - step * rtl, definition);
  if (key === 'ArrowUp') return alignRangeValue(value + step, definition);
  if (key === 'ArrowDown') return alignRangeValue(value - step, definition);
  if (key === 'PageUp') return alignRangeValue(value + step * 10, definition);
  if (key === 'PageDown') return alignRangeValue(value - step * 10, definition);
  return alignRangeValue(value, definition);
}
