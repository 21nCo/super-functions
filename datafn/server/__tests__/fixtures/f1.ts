/**
 * Fixture F1 - Test data from TEST_VECTORS.md
 */

import type { DatafnSchema } from "@datafn/core";
import type { JoinRow } from "../../src/execution/store.js";

export const fixtureF1Schema: DatafnSchema = {
  resources: [
    {
      name: "goal",
      version: 1,
      fields: [
        { name: "label", type: "string", required: true },
        { name: "status", type: "string", required: true },
        { name: "isArchived", type: "boolean", required: true },
      ],
    },
    {
      name: "task",
      version: 1,
      fields: [
        { name: "label", type: "string", required: true },
        { name: "priority", type: "number", required: true },
        { name: "goalId", type: "string", required: true },
        { name: "isArchived", type: "boolean", required: true },
        { name: "updatedAt", type: "string", required: true },
      ],
      indices: ["label"],
    },
    {
      name: "tag",
      version: 1,
      fields: [{ name: "label", type: "string", required: true }],
    },
  ],
  relations: [
    {
      from: "task",
      to: "goal",
      type: "many-one",
      relation: "goal",
      inverse: "tasks",
      fkField: "goalId",
    },
    {
      from: "task",
      to: "tag",
      type: "many-many",
      relation: "tags",
      inverse: "tasks",
      metadata: [
        { name: "order", type: "number" },
        { name: "addedAt", type: "date" },
      ],
    },
  ],
};

export const fixtureF1Data = {
  records: {
    goal: [
      { id: "goal:g1", label: "Goal 1", status: "open", isArchived: false },
      { id: "goal:g2", label: "Goal 2", status: "paused", isArchived: false },
      { id: "goal:g3", label: "Goal 3", status: "open", isArchived: true },
    ],
    task: [
      {
        id: "task:t1",
        label: "Task 1",
        priority: 5,
        goalId: "goal:g1",
        isArchived: false,
        updatedAt: "2026-01-10",
      },
      {
        id: "task:t2",
        label: "Task 2",
        priority: 2,
        goalId: "goal:g1",
        isArchived: false,
        updatedAt: "2026-01-11",
      },
      {
        id: "task:t3",
        label: "Task 3",
        priority: 3,
        goalId: "goal:g2",
        isArchived: false,
        updatedAt: "2026-01-12",
      },
      {
        id: "task:t4",
        label: "Task 4",
        priority: 10,
        goalId: "goal:g2",
        isArchived: true,
        updatedAt: "2026-01-13",
      },
    ],
    tag: [
      { id: "tag:urgent", label: "urgent" },
      { id: "tag:home", label: "home" },
    ],
  },
  joins: {
    "task.tags": [
      { from: "task:t1", to: "tag:urgent", order: 2, addedAt: "2026-01-01" },
      { from: "task:t1", to: "tag:home", order: 1, addedAt: "2026-01-02" },
      { from: "task:t3", to: "tag:urgent", order: 1, addedAt: "2026-01-03" },
    ] as JoinRow[],
  },
};
