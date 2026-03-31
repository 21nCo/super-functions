import { describe, beforeAll } from "vitest";
import { MeilisearchAdapter } from "../../src/index";
import { runConformanceSuite } from "./shared";

const MEILI_URL = process.env.SEARCHFN_MEILI_URL ?? "http://localhost:7700";
const MEILI_API_KEY = process.env.SEARCHFN_MEILI_API_KEY;

let available = false;
let testCounter = 0;

async function canConnect(url: string): Promise<boolean> {
  try {
    const response = await fetch(new URL("/health", url), { method: "GET" });
    return response.ok;
  } catch {
    return false;
  }
}

describe("MeilisearchAdapter conformance", () => {
  beforeAll(async () => {
    available = await canConnect(MEILI_URL);
    if (!available) {
      console.warn("Meilisearch not available, skipping conformance tests");
    }
  });

  runConformanceSuite({
    name: "meilisearch",
    persistent: true,
    shouldSkip: () => !available,
    create: () =>
      new MeilisearchAdapter({
        host: MEILI_URL,
        apiKey: MEILI_API_KEY,
        indexPrefix: `conf_meili_${++testCounter}`,
        requestTimeoutMs: 10_000,
        retry: { maxRetries: 1, baseDelayMs: 25, maxDelayMs: 100 },
      }),
  });
});
