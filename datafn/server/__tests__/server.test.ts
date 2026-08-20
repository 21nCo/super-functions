/**
 * DatafnServer graceful shutdown tests
 *
 * TV-REL-012: Graceful shutdown
 * REL-009: Server must implement graceful shutdown on SIGTERM/SIGINT
 *
 * Covers:
 * - close() returns a Promise
 * - close() resolves immediately when no in-flight requests
 * - close() sends WS close frame 1001 to all connected clients
 * - After close(), new requests receive 503
 * - close() resolves after in-flight requests complete
 * - close() resolves after shutdownTimeoutMs even with stuck requests
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { createDatafnServer } from "../src/server.js";
import { createDatafnPublicLinksPlugin } from "../src/plugins/public-links.js";
import { datafnMultiRegionPlugin } from "../src/plugins/multi-region.js";
import { createMemoryIndexedDirectoryStore } from "@superfunctions/db/adapters";
import type { WebSocketClient } from "../src/ws.js";

// Minimal schema for testing — no DB required
const minimalSchema = {
  resources: [
    {
      name: "items",
      version: 1,
      fields: [{ name: "title", type: "string" as const, required: true }],
    },
  ],
};

describe("DatafnServer graceful shutdown (REL-009 / TV-REL-012)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("close() returns a Promise", async () => {
    const server = await createDatafnServer({ allowUnknownResources: true, schema: minimalSchema });
    const result = server.close();
    expect(result).toBeInstanceOf(Promise);
    await result;
  });

  it("close() resolves immediately when no in-flight requests", async () => {
    const server = await createDatafnServer({ allowUnknownResources: true, schema: minimalSchema });
    const start = Date.now();
    await server.close();
    expect(Date.now() - start).toBeLessThan(200);
  });

  it("close() is idempotent \u2014 second call resolves immediately", async () => {
    const server = await createDatafnServer({ allowUnknownResources: true, schema: minimalSchema });
    await server.close();
    // Second call should not hang
    await server.close();
  });

  it("rejects different permission directories configured for the same region", async () => {
    const publicLinks = createDatafnPublicLinksPlugin({
      getOwnerActorId: () => "user:owner",
      getOwnerNamespace: () => "user:owner",
      directory: createMemoryIndexedDirectoryStore(),
      resourceRegion: "region:shared",
    });

    await expect(createDatafnServer({
      allowUnknownResources: true,
      schema: minimalSchema,
      plugins: [
        datafnMultiRegionPlugin({
          regionId: "region:shared",
          directory: createMemoryIndexedDirectoryStore(),
        }),
        publicLinks,
      ],
    })).rejects.toThrow(
      "Permission directory configuration conflict: region region:shared uses multiple directory adapters",
    );
  });

  it("TV-REL-012: close() sends WS close frame 1001 to all connected clients", async () => {
    const server = await createDatafnServer({ allowUnknownResources: true, schema: minimalSchema });
    const c1: WebSocketClient = { send: vi.fn(), close: vi.fn() };
    const c2: WebSocketClient = { send: vi.fn(), close: vi.fn() };

    server.websocketHandler.addClient(c1, { namespace: "ns1" });
    server.websocketHandler.addClient(c2, { namespace: "ns2" });

    await server.close();

    expect(c1.close).toHaveBeenCalledWith(1001, "Going Away");
    expect(c2.close).toHaveBeenCalledWith(1001, "Going Away");
  });

  it("after close(), new requests receive 503 Service Unavailable", async () => {
    const server = await createDatafnServer({ allowUnknownResources: true, schema: minimalSchema });
    await server.close();

    const response = await server.router.handle(
      new Request("http://localhost/datafn/status"),
    );
    expect(response.status).toBe(503);
    const body = await response.json() as { ok: boolean; error: { code: string } };
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("SERVICE_UNAVAILABLE");
  });

  it("TV-REL-012: close() resolves after in-flight requests complete", async () => {
    let signalInFlight: (() => void) | undefined;
    let unblockRequest: (() => void) | undefined;

    const inFlightSignal = new Promise<void>((r) => { signalInFlight = r; });
    const requestBlocker = new Promise<void>((r) => { unblockRequest = r; });

    const server = await createDatafnServer({ allowUnknownResources: true,
      schema: minimalSchema,
      authorize: async () => {
        // Signal that we're inside withAuth (inFlightCount has been incremented)
        signalInFlight?.();
        // Block until the test unblocks us
        await requestBlocker;
        return false; // doesn't matter — we just need it to block
      },
      shutdownTimeoutMs: 5_000,
    });

    // Start a request that will block in authorize
    const requestDone = server.router.handle(
      new Request("http://localhost/datafn/status"),
    );

    // Wait until we're confirmed in-flight
    await inFlightSignal;

    // Start shutdown
    let closeResolved = false;
    const closePromise = server.close().then(() => {
      closeResolved = true;
    });

    // Give close() a moment — it should NOT have resolved yet
    await new Promise((r) => setTimeout(r, 20));
    expect(closeResolved).toBe(false);

    // Unblock the in-flight request
    unblockRequest!();

    // close() should now resolve
    await closePromise;
    expect(closeResolved).toBe(true);

    await requestDone; // clean up
  }, 10_000);

  it("TV-REL-012: close() resolves after shutdownTimeoutMs with stuck requests", async () => {
    vi.useFakeTimers();

    const server = await createDatafnServer({ allowUnknownResources: true,
      schema: minimalSchema,
      authorize: async () => {
        // This promise never resolves — simulates a permanently stuck request
        await new Promise<void>(() => {});
        return true;
      },
      shutdownTimeoutMs: 1_000,
    });

    // Start a stuck request (non-awaited)
    server.router.handle(new Request("http://localhost/datafn/status"));

    // Flush microtasks so the request enters withAuth and increments inFlightCount
    await Promise.resolve();
    await Promise.resolve();

    // Start shutdown
    const closePromise = server.close();

    // Advance fake time past shutdown timeout
    vi.advanceTimersByTime(1_000);

    // close() should now resolve via timeout
    await closePromise;
  });
});
