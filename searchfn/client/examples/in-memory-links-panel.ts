/**
 * Example: In-Memory Search for Links Panel
 * 
 * Demonstrates using InMemorySearchFn for a typical UI scenario where links
 * are already loaded in memory (e.g., navigation items, bookmarks, link panel).
 */

import { InMemorySearchFn } from "../src";

interface Link {
  id: string;
  url: string;
  title: string;
  tags: string[];
  visits: number;
}

// Sample links data (already in memory)
const links: Link[] = [
  {
    id: "1",
    url: "/docs/getting-started",
    title: "Getting Started Guide",
    tags: ["documentation", "tutorial"],
    visits: 142
  },
  {
    id: "2",
    url: "/api/reference",
    title: "API Reference",
    tags: ["documentation", "api"],
    visits: 89
  },
  {
    id: "3",
    url: "/blog/search-implementation",
    title: "Building a Search Engine",
    tags: ["blog", "engineering"],
    visits: 67
  },
  {
    id: "4",
    url: "/docs/api/search",
    title: "Search API Documentation",
    tags: ["documentation", "api", "search"],
    visits: 105
  }
];

// Create in-memory search index
const searchIndex = new InMemorySearchFn({
  fields: ["title", "tags"]
});

// Index all links
console.log("Indexing links...");
for (const link of links) {
  searchIndex.add({
    id: link.id,
    fields: {
      title: link.title,
      tags: link.tags.join(" ")
    },
    store: {
      url: link.url,
      title: link.title,
      visits: link.visits
    }
  });
}

// Search examples
console.log("\n--- Search: 'api' ---");
const apiResults = searchIndex.searchDetailed("api", {
  includeStored: true,
  limit: 5
});
apiResults.forEach((result) => {
  console.log(`[${result.score.toFixed(2)}] ${result.document?.title}`);
  console.log(`  → ${result.document?.url}`);
});

console.log("\n--- Search: 'documentation' ---");
const docsResults = searchIndex.searchDetailed("documentation", {
  includeStored: true,
  limit: 5
});
docsResults.forEach((result) => {
  console.log(`[${result.score.toFixed(2)}] ${result.document?.title}`);
  console.log(`  → ${result.document?.url} (${result.document?.visits} visits)`);
});

console.log("\n--- Search: 'search' ---");
const searchResults = searchIndex.searchDetailed("search", {
  includeStored: true,
  limit: 5
});
searchResults.forEach((result) => {
  console.log(`[${result.score.toFixed(2)}] ${result.document?.title}`);
  console.log(`  → ${result.document?.url}`);
});

// Update a link (remove and re-add)
console.log("\n--- Updating link #2 ---");
searchIndex.remove("2");
searchIndex.add({
  id: "2",
  fields: {
    title: "Complete API Reference",
    tags: "documentation api reference complete"
  },
  store: {
    url: "/api/reference/complete",
    title: "Complete API Reference",
    visits: 90
  }
});

// Search again to see updated results
console.log("\n--- Search after update: 'complete' ---");
const completeResults = searchIndex.searchDetailed("complete", {
  includeStored: true
});
completeResults.forEach((result) => {
  console.log(`[${result.score.toFixed(2)}] ${result.document?.title}`);
});

// Export/import snapshot (useful for caching or transferring between components)
console.log("\n--- Exporting and restoring snapshot ---");
const snapshot = searchIndex.exportSnapshot();
console.log(`Snapshot contains ${snapshot.postings.length} postings, ${snapshot.documents.length} documents`);

// Create new instance and restore
const restoredIndex = new InMemorySearchFn({
  fields: ["title", "tags"]
});
restoredIndex.importSnapshot(snapshot);

const restoredResults = restoredIndex.searchDetailed("api", { includeStored: true });
console.log(`Restored index found ${restoredResults.length} results for 'api'`);
