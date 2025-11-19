/**
 * Example: Worker-Based Bulk Indexing with Progress Reporting
 * 
 * Demonstrates efficient bulk indexing patterns for large datasets,
 * such as indexing database records or importing external data sources.
 * Shows both manual flush and addBulk() approaches.
 */

import { indexedDB, IDBKeyRange } from "fake-indexeddb";
import { SearchFn } from "../src";

// Setup IndexedDB polyfill for Node.js environment
const globalObject = globalThis as unknown as {
  indexedDB: IDBFactory;
  IDBKeyRange?: typeof IDBKeyRange;
};
globalObject.indexedDB = indexedDB;
globalObject.IDBKeyRange = IDBKeyRange as unknown as typeof globalObject.IDBKeyRange;

// Simulated data source (like a database query result or API response)
interface DatabaseRecord {
  id: string;
  title: string;
  content: string;
  author: string;
  category: string;
  createdAt: Date;
  updatedAt: Date;
  tags: string[];
}

function simulateDatabaseQuery(limit: number): DatabaseRecord[] {
  const categories = ["Engineering", "Product", "Design", "Marketing", "Sales"];
  const authors = ["Alice", "Bob", "Charlie", "Diana", "Eve"];
  const records: DatabaseRecord[] = [];
  
  for (let i = 0; i < limit; i++) {
    const category = categories[i % categories.length];
    const author = authors[i % authors.length];
    
    records.push({
      id: `record-${i}`,
      title: `${category} Document ${i}`,
      content: `This is a detailed document about ${category.toLowerCase()} topics. It contains important information written by ${author}. The document covers various aspects and provides valuable insights for the team.`,
      author,
      category,
      createdAt: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
      tags: [category.toLowerCase(), author.toLowerCase(), `tag-${i % 10}`]
    });
  }
  
  return records;
}

// Convert database records to SearchFn format
function transformRecord(record: DatabaseRecord) {
  return {
    id: record.id,
    fields: {
      title: record.title,
      content: record.content,
      author: record.author,
      category: record.category,
      tags: record.tags.join(" ")
    },
    store: {
      title: record.title,
      author: record.author,
      category: record.category,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      tags: record.tags
    }
  };
}

async function indexWithManualFlush(records: DatabaseRecord[]) {
  console.log("\n╔═══════════════════════════════════════════════════════════╗");
  console.log("║  Approach 1: Manual Flush Pattern                        ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");
  
  const engine = new SearchFn({
    name: "bulk-worker-manual-flush",
    fields: ["title", "content", "author", "category", "tags"]
  });
  
  await engine.clear();
  
  console.log(`Indexing ${records.length} records...`);
  
  const startTime = Date.now();
  let processed = 0;
  const batchSize = 1000;
  
  for (const record of records) {
    // eslint-disable-next-line no-await-in-loop
    await engine.add(transformRecord(record), { persist: false });
    
    processed++;
    
    // Progress reporting
    if (processed % batchSize === 0) {
      const progress = Math.floor((processed / records.length) * 100);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`  → ${processed}/${records.length} (${progress}%) - ${elapsed}s elapsed`);
    }
  }
  
  console.log("\n  Flushing to IndexedDB...");
  await engine.flush();
  
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`  ✓ Complete in ${totalTime}s`);
  
  // Verify search works
  console.log("\n  Testing search...");
  const results = await engine.search("engineering document", { limit: 5 });
  console.log(`  ✓ Found ${results.length} results`);
  
  // Show sample result
  if (results.length > 0) {
    const doc = await engine.getDocument(results[0]);
    console.log(`  Sample: "${doc?.title}"`);
  }
  
  await engine.destroy();
  
  return parseFloat(totalTime);
}

async function indexWithAddBulk(records: DatabaseRecord[]) {
  console.log("\n╔═══════════════════════════════════════════════════════════╗");
  console.log("║  Approach 2: addBulk() API (Recommended)                 ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");
  
  const engine = new SearchFn({
    name: "bulk-worker-add-bulk",
    fields: ["title", "content", "author", "category", "tags"]
  });
  
  await engine.clear();
  
  console.log(`Indexing ${records.length} records...`);
  
  const startTime = Date.now();
  const documents = records.map(transformRecord);
  
  await engine.addBulk(documents, {
    batchSize: 1000,
    onProgress: (indexed, total) => {
      const progress = Math.floor((indexed / total) * 100);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      
      if (indexed % 1000 === 0 || indexed === total) {
        console.log(`  → ${indexed}/${total} (${progress}%) - ${elapsed}s elapsed`);
      }
    }
  });
  
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`  ✓ Complete in ${totalTime}s`);
  
  // Verify search works
  console.log("\n  Testing search...");
  const results = await engine.search("product insights", { limit: 5 });
  console.log(`  ✓ Found ${results.length} results`);
  
  // Show sample result
  if (results.length > 0) {
    const doc = await engine.getDocument(results[0]);
    console.log(`  Sample: "${doc?.title}"`);
  }
  
  await engine.destroy();
  
  return parseFloat(totalTime);
}

async function indexWithOldApproach(records: DatabaseRecord[], limit: number) {
  console.log("\n╔═══════════════════════════════════════════════════════════╗");
  console.log("║  Comparison: Old Approach (persist: true)                ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");
  
  const engine = new SearchFn({
    name: "bulk-worker-old-approach",
    fields: ["title", "content", "author", "category", "tags"]
  });
  
  await engine.clear();
  
  // Only index a subset to save time in demo
  const subset = records.slice(0, limit);
  console.log(`Indexing ${subset.length} records (subset for demo)...`);
  
  const startTime = Date.now();
  
  for (const record of subset) {
    // eslint-disable-next-line no-await-in-loop
    await engine.add(transformRecord(record)); // persist: true (default)
  }
  
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`  ✓ Complete in ${totalTime}s`);
  
  // Extrapolate for full dataset
  const estimatedFullTime = (parseFloat(totalTime) / subset.length) * records.length;
  console.log(`  ⏱  Estimated time for ${records.length} records: ${estimatedFullTime.toFixed(1)}s`);
  
  await engine.destroy();
  
  return estimatedFullTime;
}

async function main() {
  const recordCount = Number.parseInt(process.argv[2] ?? "5000", 10);
  
  console.log("\n╔═══════════════════════════════════════════════════════════╗");
  console.log("║         Bulk Indexing Worker Example                     ║");
  console.log("╚═══════════════════════════════════════════════════════════╝");
  console.log(`\nTotal records to index: ${recordCount}\n`);
  
  // Simulate fetching records from database
  console.log("Fetching records from database...");
  const records = simulateDatabaseQuery(recordCount);
  console.log(`✓ Fetched ${records.length} records\n`);
  
  // Run all approaches
  const manualFlushTime = await indexWithManualFlush(records);
  const addBulkTime = await indexWithAddBulk(records);
  const oldApproachTime = await indexWithOldApproach(records, Math.min(100, recordCount));
  
  // Summary
  console.log("\n╔═══════════════════════════════════════════════════════════╗");
  console.log("║                    Summary                                ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");
  
  console.log(`Records Indexed: ${recordCount}\n`);
  console.log("Performance Comparison:");
  console.log(`  Old Approach (persist: true):  ~${oldApproachTime.toFixed(1)}s (estimated)`);
  console.log(`  Manual Flush:                  ${manualFlushTime}s`);
  console.log(`  addBulk():                     ${addBulkTime}s\n`);
  
  const speedupVsOld = (oldApproachTime / addBulkTime).toFixed(1);
  console.log(`Speedup: ${speedupVsOld}x faster with batched persistence\n`);
  
  console.log("Recommendations:");
  console.log("  ✓ Use addBulk() for simplest implementation");
  console.log("  ✓ Use manual flush pattern for custom progress tracking");
  console.log("  ✓ Batch size of 1000 works well for most use cases");
  console.log("  ✓ Always call flush() after persist: false operations\n");
}

void main().catch((error) => {
  console.error("\nExample failed:", error);
  process.exitCode = 1;
});
