import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

// Load environment variables
config();

const dbUrl =
  process.env.DATABASE_URL ||
  "postgres://postgres:postgres@localhost:5432/todo_app";

export default defineConfig({
  schema: "./src/datafn-schema.drizzle.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: dbUrl,
    ssl: dbUrl.includes("ondigitalocean.com")
      ? { rejectUnauthorized: true }
      : false,
  },
});
