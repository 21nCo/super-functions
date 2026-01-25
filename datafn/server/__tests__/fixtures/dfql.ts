/**
 * Fixture DFQL - Schema for DFQL completeness tests (Phase 11)
 * From TEST_VECTORS.md DFQL schema fixture
 */

import type { DatafnSchema } from "@datafn/core";
import type { JoinRow } from "../../src/execution/store.js";

export const fixtureDfqlSchema: DatafnSchema = {
  resources: [
    {
      name: "goal",
      version: 1,
      fields: [
        { name: "label", type: "string", required: true },
        { name: "parentPath", type: "string", required: true },
      ],
    },
    {
      name: "task",
      version: 1,
      fields: [
        { name: "title", type: "string", required: true },
        { name: "goalId", type: "string", required: false },
      ],
    },
    {
      name: "tag",
      version: 1,
      fields: [{ name: "label", type: "string", required: true }],
    },
  ],
  relations: [
    {
      from: "goal",
      to: "task",
      type: "one-many",
      relation: "tasks",
      inverse: "goal",
      fkField: "goalId",
    },
    {
      from: "task",
      to: "tag",
      type: "many-many",
      relation: "tags",
      inverse: "tasks",
      metadata: [{ name: "order", type: "number" }],
    },
    {
      from: "goal",
      to: "goal",
      type: "htree",
      relation: "parent",
      inverse: "children",
      pathField: "parentPath",
    },
  ],
};

export const fixtureDfqlData = {
  records: {
    goal: [] as Array<Record<string, unknown>>,
    task: [] as Array<Record<string, unknown>>,
    tag: [] as Array<Record<string, unknown>>,
  },
  joins: {
    "task.tags": [] as JoinRow[],
  },
};
