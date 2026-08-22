export interface LocaleMatcher {
  readonly locale: string;
  normalize(value: string): string;
  equals(left: string, right: string): boolean;
  startsWith(value: string, query: string): boolean;
  includes(value: string, query: string): boolean;
  compare(left: string, right: string): number;
}

export function createLocaleMatcher(locale = 'en'): LocaleMatcher {
  const collator = new Intl.Collator(locale, { usage: 'search', sensitivity: 'base', numeric: true });
  const normalize = (value: string) => value.normalize('NFKD').toLocaleLowerCase(locale);
  const searchKey = (value: string) => normalize(value)
    .replace(/\p{M}/gu, '')
    .replace(/ß/g, 'ss')
    .replace(/æ/g, 'ae')
    .replace(/œ/g, 'oe')
    .replace(/ø/g, 'o')
    .replace(/ł/g, 'l');
  return Object.freeze({
    locale,
    normalize,
    equals: (left: string, right: string) => collator.compare(normalize(left), normalize(right)) === 0,
    startsWith(value: string, query: string) {
      return searchKey(value).startsWith(searchKey(query));
    },
    includes(value: string, query: string) {
      return searchKey(value).includes(searchKey(query));
    },
    compare: (left: string, right: string) => collator.compare(left, right),
  });
}

export function formatUIFnValueText(value: number, options: Intl.NumberFormatOptions = {}, locale = 'en'): string {
  return new Intl.NumberFormat(locale, options).format(value);
}
