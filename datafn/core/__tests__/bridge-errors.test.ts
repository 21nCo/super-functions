import { describe, expect, it } from "vitest";
import { err } from "../src/errors.js";

describe("bridge/native error codes", () => {
  it("supports the phase-00 native bridge error codes in canonical envelopes", () => {
    const unavailable = err(
      "BRIDGE_UNAVAILABLE",
      "Native bridge unavailable",
      { path: "window.webkit.messageHandlers.datafn" },
    );
    const mismatch = err(
      "BRIDGE_PROTOCOL_MISMATCH",
      "Bridge protocol version mismatch",
      { path: "protocol" },
    );
    const unsupported = err(
      "BRIDGE_METHOD_UNSUPPORTED",
      "Unsupported bridge method",
      { path: "method" },
    );
    const syncConflict = err(
      "NATIVE_SYNC_CONFLICT",
      "A namespace store may only use one remote sync backend",
      { path: "sync.native.remoteMode" },
    );
    const icloudUnavailable = err(
      "ICLOUD_UNAVAILABLE",
      "iCloud account is unavailable",
      { path: "sync.native.remoteMode" },
    );

    expect(unavailable.error.code).toBe("BRIDGE_UNAVAILABLE");
    expect(mismatch.error.code).toBe("BRIDGE_PROTOCOL_MISMATCH");
    expect(unsupported.error.code).toBe("BRIDGE_METHOD_UNSUPPORTED");
    expect(syncConflict.error.code).toBe("NATIVE_SYNC_CONFLICT");
    expect(icloudUnavailable.error.code).toBe("ICLOUD_UNAVAILABLE");
  });
});
