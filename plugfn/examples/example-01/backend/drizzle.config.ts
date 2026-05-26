import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/generated/plugfn-schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ||
      "postgres://postgres:postgres@localhost:6432/plugfn_example_01",
  },
});
