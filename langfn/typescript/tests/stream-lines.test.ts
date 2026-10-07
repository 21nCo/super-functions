import { expect, it } from "vitest";
import { readStreamLines } from "../src/models/stream-lines.js";
it("decodes fragmented utf8 and an unterminated last line", async () => {
  const bytes = new TextEncoder().encode("é\r\nlast");
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const byte of bytes) c.enqueue(Uint8Array.of(byte));
      c.close();
    },
  });
  const lines = [];
  for await (const line of readStreamLines(body)) lines.push(line);
  expect(lines).toEqual(["é\r", "last"]);
  expect(body.locked).toBe(false);
});
it("cancels the upstream reader when budget enforcement stops consumption", async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new TextEncoder().encode("usage\nmore\n"));
    },
    cancel() {
      cancelled = true;
    },
  });
  for await (const line of readStreamLines(body)) {
    expect(line).toBe("usage");
    break;
  }
  expect(cancelled).toBe(true);
  expect(body.locked).toBe(false);
});
