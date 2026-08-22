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
      const normalizedQuery = normalize(query);
      if (normalizedQuery.length === 0) return true;
      for (let end = 1; end <= normalizedValue.length; end += 1) {
        if (collator.compare(normalizedValue.slice(0, end).join(''), normalizedQuery) === 0) return true;
      }
      return false;
    },
    includes(value: string, query: string) {
      const normalizedValue = Array.from(normalize(value));
      const normalizedQuery = normalize(query);
      if (normalizedQuery.length === 0) return true;
      for (let start = 0; start < normalizedValue.length; start += 1) {
        for (let end = start + 1; end <= normalizedValue.length; end += 1) {
          if (collator.compare(normalizedValue.slice(start, end).join(''), normalizedQuery) === 0) return true;
        }
      }
      return false;
    },
    compare: (left: string, right: string) => collator.compare(left, right),
  });
}

export function formatUIFnValueText(value: number, options: Intl.NumberFormatOptions = {}, locale = 'en'): string {
  return new Intl.NumberFormat(locale, options).format(value);
}
