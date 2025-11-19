/**
 * Levenshtein Distance Implementation
 * 
 * Computes the minimum edit distance between two strings.
 * Used for fuzzy matching to find similar terms.
 */

/**
 * Calculate Levenshtein distance between two strings using space-optimized Wagner-Fischer algorithm.
 * Uses O(min(n,m)) space instead of O(n*m) by keeping only two rows in memory.
 * 
 * @param a First string
 * @param b Second string
 * @returns Minimum number of single-character edits (insertions, deletions, substitutions)
 */
export function levenshteinDistance(a: string, b: string): number {
  // Early exit for identical strings
  if (a === b) return 0;
  
  // Optimize for empty strings
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  
  // Ensure b is the shorter string for space optimization
  if (a.length < b.length) {
    [a, b] = [b, a];
  }
  
  // Only need two rows: previous and current
  // Initialize prevRow with indices [0, 1, 2, ..., b.length]
  let prevRow: number[] = Array.from({ length: b.length + 1 }, (_, i): number => i);
  // Initialize currRow with zeros
  let currRow: number[] = Array.from({ length: b.length + 1 }, (): number => 0);
  
  // Fill in the rest row by row
  for (let i = 1; i <= a.length; i++) {
    currRow[0] = i;
    
    for (let j = 1; j <= b.length; j++) {
      if (a.charAt(i - 1) === b.charAt(j - 1)) {
        // Characters match, no edit needed
        currRow[j] = prevRow[j - 1];
      } else {
        // Take minimum of three operations
        currRow[j] = Math.min(
          prevRow[j - 1] + 1,  // substitution
          currRow[j - 1] + 1,   // insertion
          prevRow[j] + 1        // deletion
        );
      }
    }
    
    // Swap rows for next iteration
    [prevRow, currRow] = [currRow, prevRow];
  }
  
  return prevRow[b.length];
}

/**
 * Expand a term to include similar terms within max edit distance
 * 
 * @param term Query term to expand
 * @param maxDistance Maximum Levenshtein distance to accept (capped at 3 for performance)
 * @param vocabulary Set of all indexed terms
 * @returns Array of similar terms (including original if present)
 */
export function fuzzyExpand(
  term: string,
  maxDistance: number,
  vocabulary: Set<string>
): string[] {
  // Cap maxDistance to practical limit (edit distance > 3 is rarely useful and very slow)
  const cappedDistance = Math.min(Math.max(1, maxDistance), 3);
  
  const candidates: string[] = [];
  const termLower = term.toLowerCase();
  
  for (const vocabTerm of vocabulary) {
    // Normalize vocabulary term to lowercase for consistent comparison
    const vocabTermLower = vocabTerm.toLowerCase();
    
    // Pre-filter by length difference (optimization)
    const lengthDiff = Math.abs(vocabTermLower.length - termLower.length);
    if (lengthDiff > cappedDistance) {
      continue;
    }
    
    // Calculate edit distance (both strings now lowercase)
    const distance = levenshteinDistance(termLower, vocabTermLower);
    if (distance <= cappedDistance) {
      // Return original term from vocabulary (preserves original casing)
      candidates.push(vocabTerm);
    }
  }
  
  return candidates;
}
