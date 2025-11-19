/**
 * Example: In-Memory Search for Collections/Items
 * 
 * Demonstrates using InMemorySearchFn for searching through collection items,
 * such as a list of notes, tasks, or any other ephemeral collection.
 */

import { InMemorySearchFn } from "../src";

interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  created: Date;
  modified: Date;
}

// Sample notes collection (already in memory)
const notes: Note[] = [
  {
    id: "note-1",
    title: "Meeting Notes - Q4 Planning",
    content: "Discussed goals for Q4, including product launch and team expansion",
    tags: ["meeting", "planning", "q4"],
    created: new Date("2024-01-15"),
    modified: new Date("2024-01-15")
  },
  {
    id: "note-2",
    title: "Search Engine Implementation",
    content: "Notes on implementing BM25 scoring algorithm with IndexedDB storage",
    tags: ["technical", "search", "indexeddb"],
    created: new Date("2024-02-01"),
    modified: new Date("2024-02-03")
  },
  {
    id: "note-3",
    title: "Product Requirements",
    content: "User authentication, search functionality, real-time collaboration features",
    tags: ["product", "requirements", "features"],
    created: new Date("2024-02-10"),
    modified: new Date("2024-02-12")
  },
  {
    id: "note-4",
    title: "Team Retrospective",
    content: "What went well: fast delivery. What to improve: better testing and documentation",
    tags: ["meeting", "retrospective", "team"],
    created: new Date("2024-03-01"),
    modified: new Date("2024-03-01")
  }
];

// Create search index for notes
const notesSearch = new InMemorySearchFn({
  fields: ["title", "content", "tags"]
});

// Index all notes
console.log("Indexing notes collection...");
for (const note of notes) {
  notesSearch.add({
    id: note.id,
    fields: {
      title: note.title,
      content: note.content,
      tags: note.tags.join(" ")
    },
    store: {
      title: note.title,
      created: note.created.toISOString(),
      modified: note.modified.toISOString(),
      tags: note.tags
    }
  });
}

// Search examples
console.log("\n--- Search: 'search' ---");
const searchResults = notesSearch.searchDetailed("search", {
  includeStored: true
});
searchResults.forEach((result) => {
  console.log(`[Score: ${result.score.toFixed(2)}]`);
  console.log(`  Title: ${result.document?.title}`);
  console.log(`  Tags: ${(result.document?.tags as string[])?.join(", ")}`);
});

console.log("\n--- Search: 'meeting' ---");
const meetingResults = notesSearch.searchDetailed("meeting", {
  includeStored: true
});
meetingResults.forEach((result) => {
  console.log(`[Score: ${result.score.toFixed(2)}]`);
  console.log(`  Title: ${result.document?.title}`);
  console.log(`  Created: ${result.document?.created}`);
});

// Search in specific field only
console.log("\n--- Search in title only: 'implementation' ---");
const titleResults = notesSearch.searchDetailed("implementation", {
  fields: ["title"],
  includeStored: true
});
titleResults.forEach((result) => {
  console.log(`  → ${result.document?.title}`);
});

// Add a new note dynamically
console.log("\n--- Adding new note ---");
const newNote: Note = {
  id: "note-5",
  title: "Search Feature Launch",
  content: "Successfully launched search feature using InMemorySearchFn for fast in-memory queries",
  tags: ["product", "launch", "search"],
  created: new Date(),
  modified: new Date()
};

notesSearch.add({
  id: newNote.id,
  fields: {
    title: newNote.title,
    content: newNote.content,
    tags: newNote.tags.join(" ")
  },
  store: {
    title: newNote.title,
    created: newNote.created.toISOString(),
    modified: newNote.modified.toISOString(),
    tags: newNote.tags
  }
});

// Search again
console.log("\n--- Search after adding new note: 'launch' ---");
const launchResults = notesSearch.searchDetailed("launch", {
  includeStored: true
});
console.log(`Found ${launchResults.length} results`);
launchResults.forEach((result) => {
  console.log(`  → ${result.document?.title}`);
});

// Clear collection
console.log("\n--- Clearing collection ---");
notesSearch.clear();
const afterClear = notesSearch.search("search");
console.log(`Results after clear: ${afterClear.length}`);
