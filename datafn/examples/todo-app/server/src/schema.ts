import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { DatafnSchema } from "@datafn/core";

// --- Drizzle Schema ---
export const todos = pgTable("todos", {
  id: uuid("id").primaryKey().defaultRandom(),
  text: text("text").notNull(),
  completed: boolean("completed").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Export for Drizzle config
export const schema = { todos };

// --- DataFn Schema ---
export const datafnSchema: DatafnSchema = {
  resources: [
    {
      name: "todos",
      version: 1,
      fields: [
        { name: "id", type: "string", required: true, unique: true },
        { name: "text", type: "string", required: true },
        { name: "completed", type: "boolean", required: true, default: false },
        { name: "createdAt", type: "date", required: true },
        { name: "updatedAt", type: "date", required: true },
      ],
      // Simple indices
      indices: {
        base: ["created_at"], // Maps to DB column name usually?
        // Adapter logic: "indices" in DataFn schema is mostly for validation/optimisation hints so far?
        // The Drizzle adapter doesn't auto-create indices based on this yet unless we use a migration tool.
        // We will just let Drizzle handle the schema structure.
      },
    },
  ],
};
