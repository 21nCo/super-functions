import { LangFnError } from "../core/errors.js";

/** Decode bounded UTF-8 lines, including an unterminated final line. */
export async function* readStreamLines(
  body: ReadableStream<Uint8Array>,
  maxLineBytes = 1024 * 1024,
): AsyncIterable<string> {
  if (!Number.isSafeInteger(maxLineBytes) || maxLineBytes < 0) throw new RangeError("maxLineBytes must be a nonnegative safe integer");
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let bufferedBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      let start = 0;
      while (start < value.length) {
        const newline = value.indexOf(10, start);
        const end = newline === -1 ? value.length : newline;
        bufferedBytes += end - start;
        if (bufferedBytes > maxLineBytes) throw new LangFnError("Provider stream line exceeds byte limit", { code: "RESPONSE_TOO_LARGE" });
        buffer += decoder.decode(value.subarray(start, end), { stream: true });
        if (newline === -1) break;
        buffer += decoder.decode(value.subarray(newline, newline + 1), { stream: true });
        yield buffer.slice(0, -1);
        buffer = "";
        bufferedBytes = 0;
        start = newline + 1;
      }
    }
    buffer += decoder.decode();
    if (buffer) yield buffer;
  } finally {
    try { await reader.cancel(); } finally { reader.releaseLock(); }
  }
}
