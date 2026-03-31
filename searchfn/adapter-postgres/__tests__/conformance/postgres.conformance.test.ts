/**
 * Postgres adapter conformance test harness.
 *
 * Binds the shared conformance suite to the PostgresAdapter.
 * Requires a running Postgres instance (see docker-compose.postgres.yml).
 */
import { describe, beforeAll } from "vitest";
import { Pool } from "pg";
import { PostgresAdapter } from "../../src/index";
import { runConformanceSuite } from "./shared";

const PG_URL =
  process.env.SEARCHFN_PG_URL ?? "postgres://searchfn:searchfn_test@localhost:5433/searchfn_test";

let available = false;

async function checkAvailability(): Promise<boolean> {
  const pool = new Pool({ connectionString: PG_URL, connectionTimeoutMillis: 3000 });
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await pool.end();
  }
}

describe("PostgresAdapter conformance", () => {
  beforeAll(async () => {
    available = await checkAvailability();
    if (!available) {
      console.warn("Postgres not available, skipping conformance tests");
    }
  });

  runConformanceSuite({
    name: "postgres",
    persistent: true,
    shouldSkip: () => !available,
    create: () => {
      return new PostgresAdapter({
        connectionString: PG_URL,
        queryTimeoutMs: 10_000,
        retry: { maxRetries: 1, baseDelayMs: 50 },
      });
    },
    cleanup: async () => {
      // Clean up all resource tables after each test
      const pool = new Pool({ connectionString: PG_URL, connectionTimeoutMillis: 3000 });
      try {
        // Get all searchfn tables and truncate them
        const result = await pool.query(
          `SELECT tablename FROM pg_tables WHERE tablename LIKE 'searchfn_docs_%'`,
        );
        for (const row of result.rows) {
          await pool.query(`DELETE FROM ${row.tablename}`);
        }
      } catch {
        // Ignore cleanup errors
      } finally {
        await pool.end();
      }
    },
  });
});
