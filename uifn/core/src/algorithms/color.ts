import { createUIFnError } from '../errors';
import { clampRangeValue } from './range';

export interface UIFnRgbaColor { readonly space: 'srgb'; readonly r: number; readonly g: number; readonly b: number; readonly alpha: number }
export interface UIFnHslaColor { readonly space: 'hsl'; readonly h: number; readonly s: number; readonly l: number; readonly alpha: number }
export type UIFnColor = UIFnRgbaColor | UIFnHslaColor;

const clampByte = (value: number) => Math.round(clampRangeValue(value, 0, 255));
const clampUnit = (value: number) => clampRangeValue(value, 0, 1);

export function createUIFnRgba(r: number, g: number, b: number, alpha = 1): UIFnRgbaColor {
  return Object.freeze({ space: 'srgb', r: clampByte(r), g: clampByte(g), b: clampByte(b), alpha: clampUnit(alpha) });
}

export function parseUIFnColor(value: string): UIFnRgbaColor {
  const hex = /^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.exec(value.trim());
  if (hex) {
    let digits = hex[1];
    if (digits.length <= 4) digits = [...digits].map((digit) => digit + digit).join('');
    const alpha = digits.length === 8 ? Number.parseInt(digits.slice(6, 8), 16) / 255 : 1;
    return createUIFnRgba(Number.parseInt(digits.slice(0, 2), 16), Number.parseInt(digits.slice(2, 4), 16), Number.parseInt(digits.slice(4, 6), 16), alpha);
  }
  const rgb = /^rgba?\(\s*([+-]?[\d.]+)\s+([+-]?[\d.]+)\s+([+-]?[\d.]+)(?:\s*\/\s*([+-]?[\d.]+%?))?\s*\)$/i.exec(value.trim());
  if (rgb) return createUIFnRgba(Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4]?.endsWith('%') ? Number(rgb[4].slice(0, -1)) / 100 : Number(rgb[4] ?? 1));
  throw createUIFnError({ code: 'UIFN_COLOR_VALUE_INVALID', component: 'ColorPicker', details: { format: 'hex-or-modern-rgb' } });
}

export function rgbaToUIFnHsla(color: UIFnRgbaColor): UIFnHslaColor {
  const r = color.r / 255; const g = color.g / 255; const b = color.b / 255;
  const max = Math.max(r, g, b); const min = Math.min(r, g, b); const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
  }
  if (h < 0) h += 360;
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return Object.freeze({ space: 'hsl', h, s: s * 100, l: l * 100, alpha: color.alpha });
}

export function hslaToUIFnRgba(color: UIFnHslaColor): UIFnRgbaColor {
  const h = ((color.h % 360) + 360) % 360; const s = clampRangeValue(color.s, 0, 100) / 100; const l = clampRangeValue(color.l, 0, 100) / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s; const x = chroma * (1 - Math.abs((h / 60) % 2 - 1)); const m = l - chroma / 2;
  const [r, g, b] = h < 60 ? [chroma, x, 0] : h < 120 ? [x, chroma, 0] : h < 180 ? [0, chroma, x] : h < 240 ? [0, x, chroma] : h < 300 ? [x, 0, chroma] : [chroma, 0, x];
  return createUIFnRgba((r + m) * 255, (g + m) * 255, (b + m) * 255, color.alpha);
}

export function serializeUIFnColor(color: UIFnColor, includeAlpha = true): string {
  const rgba = color.space === 'srgb' ? color : hslaToUIFnRgba(color);
  const hex = [rgba.r, rgba.g, rgba.b].map((channel) => channel.toString(16).padStart(2, '0')).join('');
  const alpha = Math.round(rgba.alpha * 255).toString(16).padStart(2, '0');
  return `#${hex}${includeAlpha && rgba.alpha < 1 ? alpha : ''}`;
}

export function colorUIFnDistance(left: UIFnColor, right: UIFnColor): number {
  const a = left.space === 'srgb' ? left : hslaToUIFnRgba(left); const b = right.space === 'srgb' ? right : hslaToUIFnRgba(right);
  return Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b), Math.abs(a.alpha - b.alpha) * 255);
}
