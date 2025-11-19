import type { Stemmer } from "../types";

/**
 * Simple English stemmer that handles common suffixes.
 * Uses basic rules for plurals, past tense, and gerunds.
 * Not a full Porter stemmer but sufficient for many use cases.
 */
export class EnglishStemmer implements Stemmer {
  stem(token: string): string {
    let stemmed = token;
    
    // Handle -ing suffix
    if (stemmed.length > 4 && stemmed.endsWith("ing")) {
      stemmed = stemmed.slice(0, -3);
      
      // Only remove doubled consonant for short stems (CVC pattern)
      // e.g., "running" -> "runn" -> "run", "sitting" -> "sitt" -> "sit"
      // But NOT "processing" -> "process" (already correct, don't touch)
      if (stemmed.length <= 4 && 
          stemmed.length >= 3 &&
          stemmed[stemmed.length - 1] === stemmed[stemmed.length - 2]) {
        const lastChar = stemmed[stemmed.length - 1];
        
        // Only deduplicate common doubling consonants
        if ('bdfglmnprst'.includes(lastChar)) {
          stemmed = stemmed.slice(0, -1);
        }
      }
    } else if (stemmed.length > 3 && stemmed.endsWith("ed")) {
      stemmed = stemmed.slice(0, -2);
    } else if (stemmed.length > 2 && stemmed.endsWith("s")) {
      stemmed = stemmed.slice(0, -1);
    }
    
    return stemmed;
  }
}
