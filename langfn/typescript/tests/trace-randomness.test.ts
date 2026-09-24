import { expect, it, vi } from "vitest";
import { LangFn } from "../src/client.js";
import { Tracer } from "../src/observability/tracer.js";
it("uses Node crypto when global Web Crypto is unavailable", async () => {
  vi.stubGlobal("crypto", undefined);
  const random = vi.spyOn(Math, "random").mockImplementation(() => {
    throw new Error("weak randomness");
  });
  try {
    expect(new Tracer().createTraceId()).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
    expect(
      (await new LangFn({ model: "mock" }).complete("test")).traceId,
    ).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  } finally {
    random.mockRestore();
    vi.unstubAllGlobals();
  }
});
