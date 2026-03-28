/**
 * SCA-003: Extension transport timeout tests
 */

import { describe, it, expect, vi } from "vitest";
import { createExtensionTransport, type MessageBus } from "../src/extension/transport.js";

function makeMockBus(): MessageBus & { handlers: Set<(msg: unknown) => void> } {
  const handlers = new Set<(msg: unknown) => void>();
  return {
    handlers,
    postMessage: vi.fn(),
    onMessage(handler: (msg: unknown) => void) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
  };
}

describe("SCA-003: Extension transport request timeout", () => {
  it("resolves a transport error envelope after configured timeout", async () => {
    const bus = makeMockBus();
    const adapter = createExtensionTransport(bus, { timeout: 50 });

    // Make a query that will never get a response
    const promise = adapter.query({ resource: "test" });

    await expect(promise).resolves.toMatchObject({
      ok: false,
      error: {
        code: "TRANSPORT_ERROR",
        message: expect.stringContaining("timed out after 50ms"),
      },
    });
  });

  it("clears timeout on successful response", async () => {
    const bus = makeMockBus();
    const adapter = createExtensionTransport(bus, { timeout: 5000 });

    const promise = adapter.query({ resource: "test" });

    // Simulate immediate response
    const sentMsg = (bus.postMessage as any).mock.calls[0][0];
    for (const handler of bus.handlers) {
      handler({ id: sentMsg.id, envelope: { ok: true, result: [] } });
    }

    const result = await promise;
    expect(result).toEqual({ ok: true, result: [] });
  });

  it("pending map is cleaned up on timeout", async () => {
    const bus = makeMockBus();
    const adapter = createExtensionTransport(bus, { timeout: 50 });

    const promise = adapter.query({ resource: "test" });
    await new Promise(r => setTimeout(r, 60));
    await promise;

    // Late response should be silently ignored (no crash)
    const sentMsg = (bus.postMessage as any).mock.calls[0][0];
    for (const handler of bus.handlers) {
      handler({ id: sentMsg.id, envelope: { ok: true, result: [] } });
    }
    // No error thrown — pending map was cleaned up
  });
});
