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
  const requiresGraphemeSegmentation = (value: string): boolean =>
    /\p{M}|\u200d|\ufe0e|\ufe0f|\p{Emoji_Modifier}|\p{Regional_Indicator}/u.test(value);
  const segments = (value: string): string[] => {
    const normalized = value.normalize('NFC');
    return segmenter && requiresGraphemeSegmentation(normalized)
      ? [...segmenter.segment(normalized)].map((part) => part.segment)
      : Array.from(normalized);
  };
  const MAX_COLLATION_QUERY_SEGMENTS = 256;
  const MAX_COLLATION_FALLBACK_SPAN = 256;
  const foldSegment = (value: string) => normalize(value)
    .replace(/\p{M}/gu, '')
    .replace(/ß/g, 'ss')
    .replace(/æ/g, 'ae')
    .replace(/œ/g, 'oe')
    .replace(/ø/g, 'o')
    .replace(/ł/g, 'l');
  const foldSegments = (valueSegments: readonly string[]) => {
    let key = '';
    const boundaries = new Map<number, number>([[0, 0]]);
    valueSegments.forEach((segment, index) => {
      key += foldSegment(segment);
      boundaries.set(key.length, index + 1);
    });
    return { key, boundaries };
  };
  const foldedMatch = (valueSegments: readonly string[], query: string, querySegments: readonly string[], startsOnly: boolean): boolean => {
    const valueFolded = foldSegments(valueSegments);
    const queryKey = foldSegments(querySegments).key;
    if (!queryKey) return false;
    let position = valueFolded.key.indexOf(queryKey);
    while (position >= 0) {
      const start = valueFolded.boundaries.get(position);
      const end = valueFolded.boundaries.get(position + queryKey.length);
      if (start !== undefined && end !== undefined && (!startsOnly || start === 0) && collator.compare(valueSegments.slice(start, end).join(''), query) === 0) {
        return true;
      }
      position = valueFolded.key.indexOf(queryKey, position + 1);
    }
    return false;
  };
  const fallbackMatch = (valueSegments: readonly string[], query: string, querySegments: readonly string[], startsOnly: boolean): boolean => {
    const queryFirst = querySegments[0] ?? '';
    const queryFirstFold = foldSegment(queryFirst)[0];
    const queryStartsNonAscii = /[^\x00-\x7f]/.test(queryFirst);
    const eligible = new Map<string, boolean>();
    const canStart = (segment: string): boolean => {
      const cached = eligible.get(segment);
      if (cached !== undefined) return cached;
      const special = /[^\x00-\x7f]|\p{Nd}/u.test(segment) || queryStartsNonAscii;
      const differentFold = foldSegment(segment)[0] !== queryFirstFold;
      const allowed = special || (differentFold && collator.compare(segment, queryFirst) === 0);
      eligible.set(segment, allowed);
      return allowed;
    };
    const lastStart = startsOnly ? Math.min(1, valueSegments.length) : valueSegments.length;
    for (let start = 0; start < lastStart; start += 1) {
      if (!canStart(valueSegments[start]!)) continue;
      const maximumLength = Math.min(valueSegments.length - start, MAX_COLLATION_FALLBACK_SPAN);
      for (let length = 1; length <= maximumLength; length += 1) {
        if (collator.compare(valueSegments.slice(start, start + length).join(''), query) === 0) return true;
      }
    }
    return false;
  };
  return Object.freeze({
    locale,
    normalize,
    equals: (left: string, right: string) => collator.compare(normalize(left), normalize(right)) === 0,
    startsWith(value: string, query: string) {
      if (query.length === 0) return true;
      if (!segmenter && (requiresGraphemeSegmentation(value) || requiresGraphemeSegmentation(query))) {
        return normalize(value) === normalize(query);
      }
      if (!requiresGraphemeSegmentation(value) && !requiresGraphemeSegmentation(query)
        && normalize(value).startsWith(normalize(query))) return true;
      const querySegments = segments(query);
      if (querySegments.length > MAX_COLLATION_QUERY_SEGMENTS) return false;
      const valueSegments = segments(value);
      return foldedMatch(valueSegments, query, querySegments, true)
        || fallbackMatch(valueSegments, query, querySegments, true);
    },
    includes(value: string, query: string) {
      if (query.length === 0) return true;
      if (!segmenter && (requiresGraphemeSegmentation(value) || requiresGraphemeSegmentation(query))) {
        return normalize(value) === normalize(query);
      }
      if (!requiresGraphemeSegmentation(value) && !requiresGraphemeSegmentation(query)
        && normalize(value).includes(normalize(query))) return true;
      const querySegments = segments(query);
      if (querySegments.length > MAX_COLLATION_QUERY_SEGMENTS) return false;
      const valueSegments = segments(value);
      return foldedMatch(valueSegments, query, querySegments, false)
        || fallbackMatch(valueSegments, query, querySegments, false);
    },
    compare: (left: string, right: string) => collator.compare(left, right),
  });
}

export function formatUIFnValueText(value: number, options: Intl.NumberFormatOptions = {}, locale = 'en'): string {
  return new Intl.NumberFormat(locale, options).format(value);
}
