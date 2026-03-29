/**
 * Tests for TypeScript type codegen join-table interface emission for relation capabilities (JCG-002, COMP-001)
 * Spec: 2026-03-07-new-q7m3k9r2-spec / PHASE_02
 */

import { describe, expect, it } from "vitest";
import { generateTypes } from "../codegen.js";

const BASE_RESOURCES = [
  { name: "todos", version: 1, fields: [{ name: "id", type: "string", required: true }] },
  { name: "categories", version: 1, fields: [{ name: "id", type: "string", required: true }] },
];

describe("JCG-002: type codegen join-table interface emission for relation capabilities", () => {
  it("TV-JCG-002: timestamps capability-only relation emits join interface with createdAt/updatedAt", () => {
    const output = generateTypes({
      resources: BASE_RESOURCES,
      relations: [
        {
          from: "todos",
          to: "categories",
          type: "many-many",
          relation: "tags",
          capabilities: ["timestamps"],
        },
      ],
    });

    // A join interface is emitted
    expect(output).toContain("export interface");
    // Capability fields are present as optional number (date → number)
    expect(output).toContain("createdAt?: number");
    expect(output).toContain("updatedAt?: number");
    expect(output).toContain("__datafn_join_todos_tags: DatafnJoinTodosTags;");
  });

  it("timestamps + audit: join interface includes all four capability fields as optional", () => {
    const output = generateTypes({
      resources: BASE_RESOURCES,
      relations: [
        {
          from: "todos",
          to: "categories",
          type: "many-many",
          relation: "tags",
          capabilities: ["timestamps", "audit"],
        },
      ],
    });

    expect(output).toContain("createdAt?: number");
    expect(output).toContain("updatedAt?: number");
    expect(output).toContain("createdBy?: string");
    expect(output).toContain("updatedBy?: string");
  });

  it("audit only: join interface includes createdBy/updatedBy as optional string", () => {
    const output = generateTypes({
      resources: BASE_RESOURCES,
      relations: [
        {
          from: "todos",
          to: "categories",
          type: "many-many",
          relation: "tags",
          capabilities: ["audit"],
        },
      ],
    });

    expect(output).toContain("createdBy?: string");
    expect(output).toContain("updatedBy?: string");
    expect(output).not.toContain("createdAt");
    expect(output).not.toContain("updatedAt");
  });

  it("TV-JCG-002 negative / TV-COMP-001: relation with no metadata and no capabilities emits no join interface", () => {
    const output = generateTypes({
      resources: BASE_RESOURCES,
      relations: [
        {
          from: "todos",
          to: "categories",
          type: "many-many",
          relation: "tags",
        },
      ],
    });

    // No join interface line for this relation
    // The only exports should be resource interfaces + Tables + TypedClient
    const interfaceLines = output.split("\n").filter((l) => l.startsWith("export interface"));
    // Should only have: Todos, Categories, Tables — no join interface
    expect(interfaceLines.length).toBe(3); // Todos, Categories, Tables
    expect(interfaceLines.every((l) => !l.toLowerCase().includes("join"))).toBe(true);
  });

  it("metadata + capabilities: both metadata and capability fields appear in interface", () => {
    const output = generateTypes({
      resources: BASE_RESOURCES,
      relations: [
        {
          from: "todos",
          to: "categories",
          type: "many-many",
          relation: "tags",
          capabilities: ["timestamps"],
          metadata: [{ name: "addedOrder", type: "number" }],
        },
      ],
    });

    expect(output).toContain("addedOrder: number");
    expect(output).toContain("createdAt?: number");
    expect(output).toContain("updatedAt?: number");
  });

  it("existing metadata-only behavior preserved (no regression)", () => {
    const output = generateTypes({
      resources: BASE_RESOURCES,
      relations: [
        {
          from: "todos",
          to: "categories",
          type: "many-many",
          relation: "tags",
          metadata: [{ name: "addedOrder", type: "number" }],
        },
      ],
    });

    // Join interface is emitted for metadata-only relation (existing behavior)
    expect(output).toContain("addedOrder: number");
    // No capability fields (not opted in)
    expect(output).not.toContain("createdAt");
    expect(output).not.toContain("updatedAt");
  });
});
