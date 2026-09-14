import { it, expect, vi } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LangFn } from "../src/client.js";
import { GoogleChatModel } from "../src/models/google.js";
import { createLangFnRouter } from "../src/http/routes.js";
import { normalizeStreamEvent } from "../src/streaming/sse.js";
import { DbVectorStore } from "../src/rag/db-vector-store.js";
import { parseLibraryInitializations } from "../../../packages/cli/src/utils/parse-library-init.js";

it("preserves signed Google stream messages through HTTP and persists a successful trace", async () => {
  const frame = { candidates: [{ content: { parts: [{ text: "done", thoughtSignature: "signed" }] }, finishReason: "STOP" }] };
  const saveTrace = vi.fn(async () => {});
  const fetchImpl = vi.fn(async () => new Response(`data: ${JSON.stringify(frame)}\n\n`, { headers: { "content-type": "text/event-stream" } }));
  const lang = new LangFn({ model: new GoogleChatModel({ apiKey: "fixture", fetchImpl }), observability: { traceStorage: { saveTrace, findMany: async () => [] } } });
  const response = await createLangFnRouter(lang).handle(new Request("https://test/stream", { method: "POST", body: JSON.stringify({ prompt: "hi" }) }));
  const events = (await response.text()).trim().split('\n\n').map(frame => JSON.parse(frame.slice(6)));
  expect(events.some(event => event.type === "error")).toBe(false);
  expect(events.at(-1).type).toBe("end");
  expect(events.find(event => event.type === "message").message.providerData.googleParts[0].thoughtSignature).toBe("signed");
  expect(saveTrace).toHaveBeenCalledOnce();
  expect(() => normalizeStreamEvent({ type: "message", message: null }, "trace")).toThrow("valid message");
});

it("retains concurrent RAG batches completed in the same millisecond", async () => {
  const records = new Map<string, unknown>();
  const db = { createMany: async ({ data }: any) => { for (const row of data) { expect(records.has(row.id)).toBe(false); records.set(row.id, row); } } };
  const embeddings = { embedDocuments: async (texts: string[]) => texts.map(() => [1, 0]), embedQuery: async () => [1, 0] };
  const clock = vi.spyOn(Date, "now").mockReturnValue(1000);
  try {
    const store = new DbVectorStore(db as any, embeddings);
    await Promise.all(Array.from({ length: 20 }, (_, i) => store.addDocuments([{ content: `batch-${i}`, metadata: {} }])));
    expect(records.size).toBe(20);
  } finally { clock.mockRestore(); }
});

it.each(["langfn", "memoryfn"])("discovers documented %s initialization using package metadata", name => {
  const manifest = JSON.parse(readFileSync(new URL(`../../../${name}/typescript/package.json`, import.meta.url), "utf8"));
  expect(manifest.superfunctions.initFunction).toBe(name);
  const directory = mkdtempSync(join(tmpdir(), "sfns4-init-"));
  try {
    const file = join(directory, "init.ts");
    writeFileSync(file, `${name}({ storage: { kind: "memory" } });`);
    const registry = { [manifest.superfunctions.initFunction]: manifest.name };
    expect(parseLibraryInitializations(file, registry)).toMatchObject([{ functionName: name, packageName: manifest.name }]);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
