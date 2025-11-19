import { InMemorySearchFn } from "../src/in-memory-search";

/**
 * Autocomplete Search Example
 * 
 * Demonstrates how to use edge n-grams for autocomplete functionality.
 * As users type, prefix matches are returned in real-time.
 */

// Create search engine with edge n-grams enabled
const autocomplete = new InMemorySearchFn({
  fields: ["name", "description"],
  pipeline: {
    enableEdgeNGrams: true,
    edgeNGramMinLength: 2,
    edgeNGramMaxLength: 15,
    stopWords: [] // Keep all terms for better autocomplete
  }
});

// Index some example data
const products = [
  { id: "1", name: "Anthropic Claude", description: "Advanced AI assistant" },
  { id: "2", name: "Apple MacBook", description: "Powerful laptop computer" },
  { id: "3", name: "Amazon Kindle", description: "E-reader device" },
  { id: "4", name: "Android Phone", description: "Mobile smartphone" }
];

products.forEach((product) => {
  autocomplete.add({
    id: product.id,
    fields: {
      name: product.name,
      description: product.description
    },
    store: product
  });
});

// Simulate user typing "ant"
console.log("User types: 'an'");
let results = autocomplete.searchDetailed("an", { limit: 5, includeStored: true });
results.forEach((r) => {
  console.log(`  - ${r.document?.name} (score: ${r.score.toFixed(2)})`);
});

console.log("\nUser types: 'ant'");
results = autocomplete.searchDetailed("ant", { limit: 5, includeStored: true });
results.forEach((r) => {
  console.log(`  - ${r.document?.name} (score: ${r.score.toFixed(2)})`);
});

console.log("\nUser types: 'anth'");
results = autocomplete.searchDetailed("anth", { limit: 5, includeStored: true });
results.forEach((r) => {
  console.log(`  - ${r.document?.name} (score: ${r.score.toFixed(2)})`);
});

console.log("\nUser types: 'anthropic'");
results = autocomplete.searchDetailed("anthropic", { limit: 5, includeStored: true });
results.forEach((r) => {
  console.log(`  - ${r.document?.name} (score: ${r.score.toFixed(2)})`);
});

/**
 * Output demonstrates:
 * 1. Prefix matches work progressively as user types
 * 2. Exact matches score higher than prefix matches
 * 3. Results narrow down as query becomes more specific
 */
