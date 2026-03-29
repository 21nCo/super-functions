/**
 * Tests for Drizzle join-table capability column generation (JCG-001, COMP-001)
 * Spec: 2026-03-07-new-q7m3k9r2-spec / PHASE_02
 */

import { describe, expect, it } from "vitest";
import { generateDrizzleSchema } from "../drizzle-codegen.js";

const BASE_RESOURCES = [
  { name: "todos", version: 1, fields: [{ name: "id", type: "string", required: true }] },
  { name: "categories", version: 1, fields: [{ name: "id", type: "string", required: true }] },
];

describe("JCG-001: Drizzle join-table relation capability column generation", () => {
  it("TV-JCG-001: timestamps + audit capabilities inject all four columns (postgres)", () => {
    const output = generateDrizzleSchema(
      {
        namespaced: false,
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
      },
      "postgres",
    );

    expect(output).toContain(`createdAt: bigint("created_at", { mode: "number" })`);
    expect(output).toContain(`updatedAt: bigint("updated_at", { mode: "number" })`);
    expect(output).toContain(`createdBy: text("created_by")`);
    expect(output).toContain(`updatedBy: text("updated_by")`);
  });

  it("timestamps only: injects createdAt and updatedAt but not audit fields", () => {
    const output = generateDrizzleSchema(
      {
        namespaced: false,
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
      },
      "postgres",
    );

    expect(output).toContain(`createdAt: bigint("created_at", { mode: "number" })`);
    expect(output).toContain(`updatedAt: bigint("updated_at", { mode: "number" })`);
    expect(output).not.toContain("createdBy");
    expect(output).not.toContain("updatedBy");
  });

  it("audit only: injects createdBy and updatedBy but not timestamp fields", () => {
    const output = generateDrizzleSchema(
      {
        namespaced: false,
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
      },
      "postgres",
    );

    expect(output).toContain(`createdBy: text("created_by")`);
    expect(output).toContain(`updatedBy: text("updated_by")`);
    expect(output).not.toContain("createdAt");
    expect(output).not.toContain("updatedAt");
  });

  it("TV-JCG-001 negative / TV-COMP-001: join table without capabilities has no capability columns", () => {
    const output = generateDrizzleSchema(
      {
        namespaced: false,
        resources: BASE_RESOURCES,
        relations: [
          {
            from: "todos",
            to: "categories",
            type: "many-many",
            relation: "tags",
          },
        ],
      },
      "postgres",
    );

    expect(output).not.toContain("createdAt");
    expect(output).not.toContain("updatedAt");
    expect(output).not.toContain("createdBy");
    expect(output).not.toContain("updatedBy");
    // Basic join columns still present
    expect(output).toContain(`from: text("from")`);
    expect(output).toContain(`to: text("to")`);
    expect(output).toContain(`id:`);
  });

  it("capability columns + metadata coexist in join table", () => {
    const output = generateDrizzleSchema(
      {
        namespaced: false,
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
      },
      "postgres",
    );

    expect(output).toContain(`createdAt: bigint("created_at", { mode: "number" })`);
    expect(output).toContain(`updatedAt: bigint("updated_at", { mode: "number" })`);
    expect(output).toContain(`addedOrder: numeric("added_order")`);
  });

  it("sqlite dialect: date capability fields use integer", () => {
    const output = generateDrizzleSchema(
      {
        namespaced: false,
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
      },
      "sqlite",
    );

    // SQLite maps date to integer
    expect(output).toContain(`createdAt: integer("created_at")`);
    expect(output).toContain(`updatedAt: integer("updated_at")`);
  });

  it("capability columns are sorted alphabetically with other join fields", () => {
    const output = generateDrizzleSchema(
      {
        namespaced: false,
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
      },
      "postgres",
    );

    // Scope checks to join table section only (resource tables also contain id:, from:, etc.)
    const jtStart = output.indexOf("__datafn_join_");
    expect(jtStart).toBeGreaterThan(-1);
    const joinSection = output.slice(jtStart);

    // createdAt < createdBy < from < id < to < updatedAt < updatedBy (alphabetical)
    const createdAtPos = joinSection.indexOf("createdAt:");
    const createdByPos = joinSection.indexOf("createdBy:");
    const fromPos = joinSection.indexOf("from:");
    const idPos = joinSection.indexOf("id:");
    const toPos = joinSection.indexOf("to:");
    const updatedAtPos = joinSection.indexOf("updatedAt:");
    const updatedByPos = joinSection.indexOf("updatedBy:");

    expect(createdAtPos).toBeLessThan(createdByPos);
    expect(createdByPos).toBeLessThan(fromPos);
    expect(fromPos).toBeLessThan(idPos);
    expect(idPos).toBeLessThan(toPos);
    expect(toPos).toBeLessThan(updatedAtPos);
    expect(updatedAtPos).toBeLessThan(updatedByPos);
  });
});
