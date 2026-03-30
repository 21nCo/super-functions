import type { Stemmer } from "../types";

/**
 * No-op stemmer that returns tokens unchanged.
 * Useful for languages that don't need stemming or when stemming is disabled.
 */
export class NoOpStemmer implements Stemmer {
  stem(token: string): string {
    return token;
  }
}
