import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { drizzleAdapter } from "@superfunctions/db/adapters/drizzle";
import { schema, __superfunctions_schema_versions } from "./schema.js";
import { config } from "dotenv";

config();

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

export const pool = new Pool({ connectionString: DATABASE_URL });

export const db = drizzle(pool, { schema });

export const adapter = drizzleAdapter({
  db,
  dialect: "postgres",
  schemaVersionsTable: __superfunctions_schema_versions,
  upsertKeys: {
    uploadParts: ["uploadSessionId", "partNumber"],
  },
});
