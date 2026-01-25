/**
 * Remote Unwrapping Tests - Phase 00
 * Tests TV-REMOTE-001, TV-REMOTE-002 from TEST_VECTORS.md
 */

import { describe, it, expect } from "vitest";
import { unwrapRemoteSuccess } from "../src/remote/unwrap.js";
import type { DatafnClientError } from "../src/errors.js";

describe("@datafn/client remote unwrapping", () => {
  it("TV-REMOTE-001: Wrapped and unwrapped successful responses are both accepted", () => {
    // Test wrapped success
    const wrappedResponse = {
      ok: true,
      result: { data: [{ id: "task:1" }], nextCursor: null },
    };
    const unwrappedFromWrapped = unwrapRemoteSuccess(wrappedResponse);
    expect(unwrappedFromWrapped).toEqual({
      data: [{ id: "task:1" }],
      nextCursor: null,
    });

    // Test unwrapped success (query result)
    const unwrappedQueryResponse = {
      data: [{ id: "task:2" }],
      nextCursor: null,
    };
    const unwrappedResult = unwrapRemoteSuccess(unwrappedQueryResponse);
    expect(unwrappedResult).toEqual({
      data: [{ id: "task:2" }],
      nextCursor: null,
    });

    // Test unwrapped success (aggregate result)
    const unwrappedAggregateResponse = {
      groups: [{ count: 5 }],
      nextCursor: null,
    };
    const aggregateResult = unwrapRemoteSuccess(unwrappedAggregateResponse);
    expect(aggregateResult).toEqual({
      groups: [{ count: 5 }],
      nextCursor: null,
    });
  });

  it("TV-REMOTE-002: Invalid remote shapes are rejected as TRANSPORT_ERROR", () => {
    const invalidResponse = { hello: "world" };

    expect(() => {
      unwrapRemoteSuccess(invalidResponse);
    }).toThrow();

    try {
      unwrapRemoteSuccess(invalidResponse);
    } catch (error) {
      const err = error as DatafnClientError;
      expect(err.code).toBe("TRANSPORT_ERROR");
      expect(err.message).toBe("Transport error: unexpected response shape");
      expect(err.details).toEqual({ path: "$" });
    }
  });

  it("Wrapped error responses throw mapped DatafnClientError", () => {
    const errorResponse = {
      ok: false,
      error: {
        code: "DFQL_INVALID",
        message: "Invalid DFQL: resource must be string",
        details: { path: "resource" },
      },
    };

    expect(() => {
      unwrapRemoteSuccess(errorResponse);
    }).toThrow();

    try {
      unwrapRemoteSuccess(errorResponse);
    } catch (error) {
      const err = error as DatafnClientError;
      expect(err.code).toBe("DFQL_INVALID");
      expect(err.message).toBe("Invalid DFQL: resource must be string");
      expect(err.details).toEqual({ path: "resource" });
    }
  });

  it("Non-object responses throw TRANSPORT_ERROR", () => {
    expect(() => unwrapRemoteSuccess(null)).toThrow();
    expect(() => unwrapRemoteSuccess("string")).toThrow();
    expect(() => unwrapRemoteSuccess(123)).toThrow();
    expect(() => unwrapRemoteSuccess(undefined)).toThrow();
  });
});
