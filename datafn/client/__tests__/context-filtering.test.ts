/**
 * Phase 01 Tests - TV-EVT-002, TV-EVT-002N
 * Context filtering tests
 */

import { describe, it, expect } from "vitest";
import { matchesFilter } from "../src/events/filter.js";
import type { DatafnEvent } from "@datafn/core";

describe("Phase 01 - Context Filtering", () => {
  it("TV-EVT-002: Context filter matches by shallow equality and keys", () => {
    const event: DatafnEvent = {
      type: "mutation_applied",
      resource: "node",
      timestampMs: 1,
      context: { tag: "ComponentBaseLayer", pane: "left" },
    };

    const filter = {
      resource: "node",
      contextKeys: ["tag"],
      context: { tag: "ComponentBaseLayer" },
    };

    expect(matchesFilter(event, filter)).toBe(true);
  });

  it("TV-EVT-002N: Context filter fails when values differ", () => {
    const event: DatafnEvent = {
      type: "mutation_applied",
      resource: "node",
      timestampMs: 1,
      context: { tag: "B" },
    };

    const filter = {
      resource: "node",
      context: { tag: "A" },
    };

    expect(matchesFilter(event, filter)).toBe(false);
  });

  it("Context filter fails when event.context is missing", () => {
    const event: DatafnEvent = {
      type: "mutation_applied",
      resource: "node",
      timestampMs: 1,
    };

    const filter = {
      context: { tag: "A" },
    };

    expect(matchesFilter(event, filter)).toBe(false);
  });

  it("ContextKeys filter matches only when all keys exist", () => {
    const event: DatafnEvent = {
      type: "mutation_applied",
      resource: "node",
      timestampMs: 1,
      context: { tag: "A", pane: "left" },
    };

    expect(
      matchesFilter(event, {
        contextKeys: ["tag", "pane"],
      }),
    ).toBe(true);

    expect(
      matchesFilter(event, {
        contextKeys: ["tag", "missing"],
      }),
    ).toBe(false);
  });

  it("Context shallow equality checks all filter key/value pairs", () => {
    const event: DatafnEvent = {
      type: "mutation_applied",
      resource: "node",
      timestampMs: 1,
      context: { a: 1, b: 2, c: 3 },
    };

    // Match when subset matches
    expect(
      matchesFilter(event, {
        context: { a: 1, b: 2 },
      }),
    ).toBe(true);

    // Fail when one value differs
    expect(
      matchesFilter(event, {
        context: { a: 1, b: 999 },
      }),
    ).toBe(false);
  });
});
