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
  type GraphemeSegmenter = { segment(value: string): Iterable<{ segment: string }> };
  const Segmenter = (Intl as unknown as {
    Segmenter?: new (locale: string, options: { granularity: 'grapheme' }) => GraphemeSegmenter;
  }).Segmenter;
  const segmenter = Segmenter
    ? new Segmenter(locale, { granularity: 'grapheme' })
    : undefined;
  const segments = (value: string): string[] => segmenter
    ? [...segmenter.segment(value.normalize('NFC'))].map((part) => part.segment)
    : Array.from(value.normalize('NFC'));
  const MAX_COLLATION_QUERY_SEGMENTS = 256;
  const COLLATION_LENGTH_VARIANCE = 8;
  const initial = (value: string): string | undefined => normalize(value).replace(/\p{M}/gu, '')[0];
  const matchesAt = (valueSegments: readonly string[], query: string, queryLength: number, queryInitial: string | undefined, start: number): boolean => {
    const valueInitial = normalize(valueSegments[start] ?? '').replace(/\p{M}/gu, '')[0];
    if (valueInitial !== queryInitial && /^[a-z]$/.test(valueInitial ?? '') && /^[a-z]$/.test(queryInitial ?? '')) {
      return false;
    }
    const minimumLength = Math.max(1, queryLength - COLLATION_LENGTH_VARIANCE);
    const maximumLength = Math.min(valueSegments.length - start, queryLength + COLLATION_LENGTH_VARIANCE);
    for (let length = minimumLength; length <= maximumLength; length += 1) {
      if (collator.compare(valueSegments.slice(start, start + length).join(''), query) === 0) return true;
    }
    return false;
  };
  return Object.freeze({
    locale,
    normalize,
    equals: (left: string, right: string) => collator.compare(normalize(left), normalize(right)) === 0,
    startsWith(value: string, query: string) {
      if (query.length === 0) return true;
      if (normalize(value).startsWith(normalize(query))) return true;
      const queryLength = segments(query).length;
      if (queryLength > MAX_COLLATION_QUERY_SEGMENTS) return false;
      return matchesAt(segments(value), query, queryLength, initial(query), 0);
    },
    includes(value: string, query: string) {
      if (query.length === 0) return true;
      if (normalize(value).includes(normalize(query))) return true;
      const queryLength = segments(query).length;
      if (queryLength > MAX_COLLATION_QUERY_SEGMENTS) return false;
      const valueSegments = segments(value);
      const queryInitial = initial(query);
      for (let start = 0; start < valueSegments.length; start += 1) {
        if (matchesAt(valueSegments, query, queryLength, queryInitial, start)) return true;
      }
      return false;
    },
    compare: (left: string, right: string) => collator.compare(left, right),
  });
}

export function formatUIFnValueText(value: number, options: Intl.NumberFormatOptions = {}, locale = 'en'): string {
  return new Intl.NumberFormat(locale, options).format(value);
}
