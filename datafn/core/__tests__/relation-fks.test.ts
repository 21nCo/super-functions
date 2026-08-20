import { describe, expect, it } from "vitest";
import { normalizeRelationFkRecord } from "../src/relation-fks.js";
import type { DatafnSchema } from "../src/types.js";

describe("relation FK normalization", () => {
  it("normalizes optional empty relation FK values to null", () => {
    const schema: DatafnSchema = {
      resources: [
        {
          name: "objective",
          version: 1,
          fields: [{ name: "id", type: "string", required: true }],
        },
        {
          name: "task",
          version: 1,
          fields: [
            { name: "id", type: "string", required: true },
            { name: "objectiveId", type: "string", nullable: true },
            { name: "label", type: "string" },
          ],
        },
      ],
      relations: [
        {
          from: "task",
          to: "objective",
          type: "many-one",
          relation: "objective",
          fkField: "objectiveId",
        },
      ],
    };

    expect(
      normalizeRelationFkRecord(schema, "task", {
        id: "task:1",
        objectiveId: "",
        label: "",
      }),
    ).toEqual({
      id: "task:1",
      objectiveId: null,
      label: "",
    });
  });

  it("does not normalize required empty relation FK values", () => {
    const schema: DatafnSchema = {
      resources: [
        {
          name: "session",
          version: 1,
          fields: [{ name: "id", type: "string", required: true }],
        },
        {
          name: "sessionLog",
          version: 1,
          fields: [
            { name: "id", type: "string", required: true },
            { name: "sessionId", type: "string", required: true },
          ],
        },
      ],
      relations: [
        {
          from: "sessionLog",
          to: "session",
          type: "many-one",
          relation: "session",
          fkField: "sessionId",
        },
      ],
    };

    expect(
      normalizeRelationFkRecord(schema, "sessionLog", {
        id: "sessionLog:1",
        sessionId: "",
      }),
    ).toEqual({
      id: "sessionLog:1",
      sessionId: "",
    });
  });

  it("does not treat an explicitly required nullable relation FK as optional", () => {
    const schema: DatafnSchema = {
      resources: [
        {
          name: "account",
          version: 1,
          fields: [{ name: "id", type: "string", required: true }],
        },
        {
          name: "session",
          version: 1,
          fields: [
            { name: "id", type: "string", required: true },
            { name: "accountId", type: "string", required: true, nullable: true },
          ],
        },
      ],
      relations: [
        {
          from: "session",
          to: "account",
          type: "many-one",
          relation: "account",
          fkField: "accountId",
        },
      ],
    };

    expect(
      normalizeRelationFkRecord(schema, "session", {
        id: "session:1",
        accountId: "",
      }),
    ).toEqual({ id: "session:1", accountId: "" });
  });
});
