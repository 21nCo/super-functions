/**
 * Test helper to seed fixture data into a database adapter
 */

import type { Adapter } from "@superfunctions/db";

interface FixtureData {
  records: Record<string, Array<Record<string, unknown>>>;
  joins?: Record<string, Array<Record<string, unknown>>>;
}

/**
 * Seed fixture data into a database adapter
 */
export async function seedFixture(
  db: Adapter,
  fixtureData: FixtureData,
): Promise<void> {
  const namespace = "datafn";

  // Seed all records
  for (const [model, records] of Object.entries(fixtureData.records)) {
    for (const record of records) {
      await db.create({
        model,
        data: record,
        namespace,
      });
    }
  }

  // Seed join tables for many-many relations
  if (fixtureData.joins) {
    for (const [relationKey, joinRows] of Object.entries(fixtureData.joins)) {
      // relationKey format: "resource.relation" e.g. "task.tags"
      const joinTableName = `__datafn_join_${relationKey.replace(".", "_")}`;

      for (const joinRow of joinRows) {
        await db.create({
          model: joinTableName,
          data: joinRow,
          namespace,
        });
      }
    }
  }
}
