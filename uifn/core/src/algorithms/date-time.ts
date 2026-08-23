import { createUIFnError } from '../errors';

export interface UIFnCalendarDate { readonly calendar: 'gregory'; readonly year: number; readonly month: number; readonly day: number }
export interface UIFnCalendarDateTime extends UIFnCalendarDate { readonly hour: number; readonly minute: number; readonly second?: number }
export interface UIFnZonedResolution { readonly kind: 'exact' | 'gap' | 'fold'; readonly instants: readonly number[] }
export type UIFnDateSegment = 'year' | 'month' | 'day';

const DAY_MS = 86_400_000;

function utcDate(
  year: number,
  monthIndex: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  const date = new Date(0);
  date.setUTCHours(hour, minute, second, 0);
  date.setUTCFullYear(year, monthIndex, day);
  return date;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function createUIFnCalendarDate(year: number, month: number, day: number): UIFnCalendarDate {
  const monthLength = Number.isInteger(year) && Number.isInteger(month) && month >= 1 && month <= 12
    ? daysInMonth(year, month)
    : Number.NaN;
  const instant = Number.isFinite(monthLength) && Number.isInteger(day) && day >= 1 && day <= monthLength
    ? utcDate(year, month - 1, day).getTime()
    : Number.NaN;
  if (!Number.isFinite(instant)) {
    throw createUIFnError({ code: 'UIFN_DATE_VALUE_INVALID', component: 'Date', details: { year, month, day } });
  }
  return Object.freeze({ calendar: 'gregory', year, month, day });
}

export function parseUIFnIsoDate(value: string): UIFnCalendarDate {
  const match = /^(\d{4,6})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw createUIFnError({ code: 'UIFN_AMBIENT_DATE_PARSE', component: 'Date', details: { format: 'YYYY-MM-DD' } });
  return createUIFnCalendarDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

export function serializeUIFnDate(value: UIFnCalendarDate): string {
  return `${String(value.year).padStart(4, '0')}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}`;
}

export function compareUIFnDates(left: UIFnCalendarDate, right: UIFnCalendarDate): number {
  return Math.sign(
    left.year - right.year
    || left.month - right.month
    || left.day - right.day,
  );
}

export function addUIFnDateDays(value: UIFnCalendarDate, amount: number): UIFnCalendarDate {
  const date = utcDate(value.year, value.month - 1, value.day);
  date.setTime(date.getTime() + Math.trunc(amount) * DAY_MS);
  return createUIFnCalendarDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function addUIFnDateMonths(value: UIFnCalendarDate, amount: number): UIFnCalendarDate {
  const absolute = value.year * 12 + value.month - 1 + Math.trunc(amount);
  const year = Math.floor(absolute / 12);
  const month = ((absolute % 12) + 12) % 12 + 1;
  return createUIFnCalendarDate(year, month, Math.min(value.day, daysInMonth(year, month)));
}

export function setUIFnDateSegment(value: UIFnCalendarDate, segment: UIFnDateSegment, raw: number): UIFnCalendarDate {
  if (segment === 'year') return createUIFnCalendarDate(Math.trunc(raw), value.month, Math.min(value.day, daysInMonth(Math.trunc(raw), value.month)));
  if (segment === 'month') {
    const month = Math.min(12, Math.max(1, Math.trunc(raw)));
    return createUIFnCalendarDate(value.year, month, Math.min(value.day, daysInMonth(value.year, month)));
  }
  return createUIFnCalendarDate(value.year, value.month, Math.min(daysInMonth(value.year, value.month), Math.max(1, Math.trunc(raw))));
}

export function formatUIFnDate(value: UIFnCalendarDate, locale: string, options: Intl.DateTimeFormatOptions = {}): string {
  const era = value.year <= 0 && options.era === undefined ? { era: 'short' as const } : {};
  return new Intl.DateTimeFormat(locale, { calendar: value.calendar, timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric', ...options, ...era })
    .format(utcDate(value.year, value.month - 1, value.day, 12));
}

export function firstUIFnDayOfWeek(locale: string): number {
  const info = (new Intl.Locale(locale) as Intl.Locale & { weekInfo?: { firstDay: number } }).weekInfo;
  if (info) return info.firstDay % 7;
  const region = new Intl.Locale(locale).maximize().region;
  if (['US', 'CA', 'JP', 'PH'].includes(region ?? '')) return 0;
  if (['AE', 'AF', 'IR'].includes(region ?? '')) return 6;
  return 1;
}

export function createUIFnMonthGrid(anchor: UIFnCalendarDate, locale: string): readonly UIFnCalendarDate[] {
  const first = createUIFnCalendarDate(anchor.year, anchor.month, 1);
  const weekday = utcDate(first.year, first.month - 1, 1).getUTCDay();
  const offset = (weekday - firstUIFnDayOfWeek(locale) + 7) % 7;
  const start = addUIFnDateDays(first, -offset);
  return Object.freeze(Array.from({ length: 42 }, (_, index) => addUIFnDateDays(start, index)));
}

function zonedParts(instant: number, timeZone: string): readonly number[] {
  const formatter = new Intl.DateTimeFormat('en-US-u-nu-latn', {
    timeZone, calendar: 'gregory', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const values = Object.fromEntries(formatter.formatToParts(new Date(instant)).map((part) => [part.type, part.value]));
  return [Number(values.year), Number(values.month), Number(values.day), Number(values.hour), Number(values.minute), Number(values.second)];
}

export function resolveUIFnZonedDateTime(value: UIFnCalendarDateTime, timeZone: string): UIFnZonedResolution {
  const second = value.second ?? 0;
  const target = [value.year, value.month, value.day, value.hour, value.minute, second];
  const approximate = utcDate(value.year, value.month - 1, value.day, value.hour, value.minute, second).getTime();
  const matches: number[] = [];
  for (let minute = -1_080; minute <= 1_080; minute += 1) {
    const instant = approximate + minute * 60_000;
    if (zonedParts(instant, timeZone).every((part, index) => part === target[index])) matches.push(instant);
  }
  const unique = [...new Set(matches)];
  return Object.freeze({ kind: unique.length === 0 ? 'gap' : unique.length > 1 ? 'fold' : 'exact', instants: Object.freeze(unique) });
}

export function isUIFnDateAvailable(
  value: UIFnCalendarDate,
  options: { readonly min?: UIFnCalendarDate; readonly max?: UIFnCalendarDate; readonly unavailable?: (value: UIFnCalendarDate) => boolean },
): boolean {
  if (options.min && compareUIFnDates(value, options.min) < 0) return false;
  if (options.max && compareUIFnDates(value, options.max) > 0) return false;
  return !options.unavailable?.(value);
}
