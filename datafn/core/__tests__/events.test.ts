/**
 * Test suite for event and filter types
 */

import { describe, it, expect } from "vitest";
import type { DatafnEvent, DatafnEventFilter } from "../src/index.js";

/**
 * Helper function to match events against filters
 * This is a minimal implementation for type validation tests
 * The full implementation lives in @datafn/client
 */
function matchesFilter(event: DatafnEvent, filter: DatafnEventFilter): boolean {
  // Type matching
  if (filter.type !== undefined) {
    const types = Array.isArray(filter.type) ? filter.type : [filter.type];
    if (!types.includes(event.type)) {
      return false;
    }
  }

  // Resource matching
  if (filter.resource !== undefined) {
    const resources = Array.isArray(filter.resource)
      ? filter.resource
      : [filter.resource];
    if (!event.resource || !resources.includes(event.resource)) {
      return false;
    }
  }

  // Action matching
  if (filter.action !== undefined) {
    const actions = Array.isArray(filter.action)
      ? filter.action
      : [filter.action];
    if (!event.action || !actions.includes(event.action)) {
      return false;
    }
  }

  // Fields matching (non-empty intersection)
  if (filter.fields !== undefined && filter.fields.length > 0) {
    if (!event.fields || event.fields.length === 0) {
      return false;
    }
    const hasIntersection = event.fields.some((field) =>
      filter.fields!.includes(field),
    );
    if (!hasIntersection) {
      return false;
    }
  }

  // ContextKeys matching (all required keys must exist)
  if (filter.contextKeys !== undefined && filter.contextKeys.length > 0) {
    if (!event.context || typeof event.context !== "object") {
      return false;
    }
    const contextObj = event.context as Record<string, unknown>;
    for (const key of filter.contextKeys) {
      if (!(key in contextObj)) {
        return false;
      }
    }
  }

  return true;
}

describe("DatafnEvent and DatafnEventFilter types", () => {
  describe("TV-CORE-EVENT-001: event/filter supports action/fields/contextKeys (positive)", () => {
    it("should match event with action in filter array", () => {
      const event: DatafnEvent = {
        type: "mutation_applied",
        resource: "task",
        ids: ["task:1"],
        mutationId: "m-1",
        clientId: "client:1",
        timestampMs: 1,
        action: "merge",
        fields: ["title"],
        context: { source: "ui", traceId: "t-1" },
      };

      const filter: DatafnEventFilter = {
        type: "mutation_applied",
        action: ["merge", "insert"],
        fields: ["title", "done"],
        contextKeys: ["traceId"],
      };

      expect(matchesFilter(event, filter)).toBe(true);
    });

    it("should match when event fields intersect with filter fields", () => {
      const event: DatafnEvent = {
        type: "mutation_applied",
        resource: "task",
        ids: ["task:1"],
        timestampMs: 1,
        action: "merge",
        fields: ["title", "description"],
      };

      const filter: DatafnEventFilter = {
        fields: ["title", "done"], // Has "title" in common
      };

      expect(matchesFilter(event, filter)).toBe(true);
    });

    it("should match when all contextKeys are present", () => {
      const event: DatafnEvent = {
        type: "mutation_applied",
        timestampMs: 1,
        context: { userId: "user:1", traceId: "t-1", sessionId: "s-1" },
      };

      const filter: DatafnEventFilter = {
        contextKeys: ["userId", "traceId"],
      };

      expect(matchesFilter(event, filter)).toBe(true);
    });
  });

  describe("TV-CORE-EVENT-002: contextKeys requires presence (negative)", () => {
    it("should not match when required contextKey is missing", () => {
      const event: DatafnEvent = {
        type: "mutation_applied",
        timestampMs: 1,
        context: { source: "ui" },
      };

      const filter: DatafnEventFilter = {
        contextKeys: ["traceId"], // Not present in event.context
      };

      expect(matchesFilter(event, filter)).toBe(false);
    });

    it("should not match when context is not an object", () => {
      const event: DatafnEvent = {
        type: "mutation_applied",
        timestampMs: 1,
        context: "string-context",
      };

      const filter: DatafnEventFilter = {
        contextKeys: ["traceId"],
      };

      expect(matchesFilter(event, filter)).toBe(false);
    });

    it("should not match when context is missing", () => {
      const event: DatafnEvent = {
        type: "mutation_applied",
        timestampMs: 1,
      };

      const filter: DatafnEventFilter = {
        contextKeys: ["traceId"],
      };

      expect(matchesFilter(event, filter)).toBe(false);
    });
  });

  describe("Type compilation and shape validation", () => {
    it("DatafnEvent should have timestampMs as required field", () => {
      const event: DatafnEvent = {
        type: "mutation_applied",
        timestampMs: Date.now(),
      };

      expect(event.timestampMs).toBeDefined();
      expect(typeof event.timestampMs).toBe("number");
    });

    it("DatafnEvent should support optional action and fields", () => {
      const eventWithAction: DatafnEvent = {
        type: "mutation_applied",
        timestampMs: 1,
        action: "merge",
        fields: ["title", "done"],
      };

      expect(eventWithAction.action).toBe("merge");
      expect(eventWithAction.fields).toEqual(["title", "done"]);

      const eventWithoutAction: DatafnEvent = {
        type: "mutation_applied",
        timestampMs: 1,
      };

      expect(eventWithoutAction.action).toBeUndefined();
      expect(eventWithoutAction.fields).toBeUndefined();
    });

    it("DatafnEventFilter should support action as string or array", () => {
      const filterString: DatafnEventFilter = {
        action: "merge",
      };

      const filterArray: DatafnEventFilter = {
        action: ["merge", "insert", "update"],
      };

      expect(filterString.action).toBe("merge");
      expect(Array.isArray(filterArray.action)).toBe(true);
    });

    it("DatafnEventFilter should support fields and contextKeys", () => {
      const filter: DatafnEventFilter = {
        fields: ["title", "done"],
        contextKeys: ["userId", "traceId"],
      };

      expect(filter.fields).toEqual(["title", "done"]);
      expect(filter.contextKeys).toEqual(["userId", "traceId"]);
    });
  });

  describe("Additional negative cases", () => {
    it("should not match when action does not match", () => {
      const event: DatafnEvent = {
        type: "mutation_applied",
        timestampMs: 1,
        action: "delete",
      };

      const filter: DatafnEventFilter = {
        action: ["merge", "insert"],
      };

      expect(matchesFilter(event, filter)).toBe(false);
    });

    it("should not match when fields have no intersection", () => {
      const event: DatafnEvent = {
        type: "mutation_applied",
        timestampMs: 1,
        fields: ["title", "done"],
      };

      const filter: DatafnEventFilter = {
        fields: ["description", "priority"],
      };

      expect(matchesFilter(event, filter)).toBe(false);
    });

    it("should not match when event has no fields but filter requires them", () => {
      const event: DatafnEvent = {
        type: "mutation_applied",
        timestampMs: 1,
      };

      const filter: DatafnEventFilter = {
        fields: ["title"],
      };

      expect(matchesFilter(event, filter)).toBe(false);
    });
  });
});
