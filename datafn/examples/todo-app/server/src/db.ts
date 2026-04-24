import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { drizzleAdapter } from "@superfunctions/db/adapters/drizzle";
import { schema } from "./datafn-schema.drizzle.js";
import { config } from "dotenv";

// Load environment variables from .env file
config();

const { Pool } = pg;

// Database connection URL
const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgres://postgres:postgres@localhost:5432/todo_app";

const ssl =
  DATABASE_URL.includes("ondigitalocean.com")
    ? { rejectUnauthorized: true }
    : false;

// Initialize Postgres Pool
export const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl,
});

// Initialize Drizzle
// IMPORTANT: We must pass the schema to drizzle() for the adapter to work!
export const db = drizzle(pool, { schema });

// Initialize DataFn Adapter
export const adapter = drizzleAdapter({
  db,
  dialect: "postgres",
  debug: true,
});
