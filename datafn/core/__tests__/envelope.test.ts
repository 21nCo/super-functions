/**
 * Test suite for envelope utilities
 */

import { describe, it, expect } from "vitest";
import { unwrapEnvelope, ok, err } from "../src/index.js";
import type { DatafnEnvelope } from "../src/index.js";

describe("unwrapEnvelope", () => {
  describe("TV-CORE-UTIL-001: ok:true returns result", () => {
    it("should return the result value for ok:true envelope", () => {
      const envelope: DatafnEnvelope<number> = { ok: true, result: 123 };
      const value = unwrapEnvelope(envelope);
      expect(value).toBe(123);
    });

    it("should return complex objects for ok:true envelope", () => {
      const envelope = ok({ x: 1, y: "test" });
      const value = unwrapEnvelope(envelope);
      expect(value).toEqual({ x: 1, y: "test" });
    });

    it("should preserve type information", () => {
      const envelope: DatafnEnvelope<string[]> = {
        ok: true,
        result: ["a", "b", "c"],
      };
      const value = unwrapEnvelope(envelope);
      expect(value).toEqual(["a", "b", "c"]);
    });
  });

  describe("TV-CORE-UTIL-002: ok:false throws exact error", () => {
    it("should throw the exact error object for ok:false envelope", () => {
      const envelope: DatafnEnvelope<never> = {
        ok: false,
        error: {
          code: "SCHEMA_INVALID",
          message: "Invalid schema",
          details: { path: "resources" },
        },
      };

      expect(() => unwrapEnvelope(envelope)).toThrow();

      try {
        unwrapEnvelope(envelope);
        // Should not reach here
        expect(true).toBe(false);
      } catch (error: any) {
        // Verify exact error shape matches
        expect(error.code).toBe("SCHEMA_INVALID");
        expect(error.message).toBe("Invalid schema");
        expect(error.details).toEqual({ path: "resources" });
      }
    });

    it("should throw exact error with default path", () => {
      const envelope = err("INTERNAL", "Internal error");

      try {
        unwrapEnvelope(envelope);
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.code).toBe("INTERNAL");
        expect(error.message).toBe("Internal error");
        expect(error.details).toEqual({ path: "$" });
      }
    });

    it("should preserve all error details fields", () => {
      const envelope: DatafnEnvelope<never> = {
        ok: false,
        error: {
          code: "DFQL_INVALID",
          message: "Invalid DFQL: resource must be string",
          details: { path: "resource", extra: "info" },
        },
      };

      try {
        unwrapEnvelope(envelope);
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.code).toBe("DFQL_INVALID");
        expect(error.message).toBe("Invalid DFQL: resource must be string");
        expect(error.details.path).toBe("resource");
        expect(error.details.extra).toBe("info");
      }
    });
  });

  describe("TV-CORE-ENV-001: DatafnEnvelope shape validation", () => {
    it("ok:true envelope has correct shape", () => {
      const envelope = ok({ x: 1 });
      expect(envelope).toHaveProperty("ok", true);
      expect(envelope).toHaveProperty("result");
      expect(envelope).not.toHaveProperty("error");
    });

    it("ok:false envelope has correct shape", () => {
      const envelope = err("FORBIDDEN", "Forbidden");
      expect(envelope).toHaveProperty("ok", false);
      expect(envelope).toHaveProperty("error");
      expect(envelope).not.toHaveProperty("result");
      expect(envelope.ok === false && envelope.error.code).toBe("FORBIDDEN");
      expect(envelope.ok === false && envelope.error.message).toBe("Forbidden");
      expect(envelope.ok === false && envelope.error.details).toEqual({
        path: "$",
      });
    });
  });
});
