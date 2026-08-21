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
  return Object.freeze({
    locale,
    normalize,
    equals: (left: string, right: string) => collator.compare(normalize(left), normalize(right)) === 0,
    startsWith(value: string, query: string) {
      const normalizedValue = Array.from(normalize(value));
      const normalizedQuery = Array.from(normalize(query));
      if (normalizedQuery.length === 0) return true;
      return collator.compare(normalizedValue.slice(0, normalizedQuery.length).join(''), normalizedQuery.join('')) === 0;
    },
    includes(value: string, query: string) {
      const normalizedValue = Array.from(normalize(value));
      const normalizedQuery = Array.from(normalize(query));
      if (normalizedQuery.length === 0) return true;
      for (let index = 0; index <= normalizedValue.length - normalizedQuery.length; index += 1) {
        if (collator.compare(normalizedValue.slice(index, index + normalizedQuery.length).join(''), normalizedQuery.join('')) === 0) return true;
      }
      return false;
    },
    compare: (left: string, right: string) => collator.compare(left, right),
  });
}

export function formatUIFnValueText(value: number, options: Intl.NumberFormatOptions = {}, locale = 'en'): string {
  return new Intl.NumberFormat(locale, options).format(value);
}
