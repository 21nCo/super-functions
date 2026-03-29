import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/datafn-schema.drizzle.ts",
  dialect: "sqlite",
  dbCredentials: { url: "./data/sharing-app.db" },
});
