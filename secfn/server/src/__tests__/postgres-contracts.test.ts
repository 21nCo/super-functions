import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, it } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import {
  pgTable,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import { drizzleAdapter } from "../../../../packages/db/src/adapters/drizzle/index.js";
import { getSecFnSchema } from "../../../core/src/schema.js";
import { createSecFnServer } from "../index.js";
const url = process.env.SECFN_TEST_DATABASE_URL;
const schemaName = `rex_contract_${crypto.randomUUID().replaceAll("-", "")}`;
let created = false;
const client = url ? postgres(url, { max: 1, onnotice: () => {} }) : undefined;
let server: ReturnType<typeof createSecFnServer>;
beforeAll(async () => {
  if (!client) return;
  await client.unsafe(`CREATE SCHEMA ${schemaName}`);
  created = true;
  await client.unsafe(`SET search_path TO ${schemaName}`);
  const schema: Record<string, any> = {};
  for (const table of getSecFnSchema()) {
    const columns: Record<string, any> = {};
    const sql: string[] = [];
    for (const [key, field] of Object.entries(table.fields)) {
      const name = field.fieldName ?? key;
      const type =
        field.type === "date"
          ? "timestamptz"
          : field.type === "json"
            ? "jsonb"
            : field.type === "number"
              ? "integer"
              : field.type === "boolean"
                ? "boolean"
                : "text";
      columns[key] =
        type === "timestamptz"
          ? timestamp(name, { withTimezone: true })
          : type === "jsonb"
            ? jsonb(name)
            : type === "integer"
              ? integer(name)
              : type === "boolean"
                ? boolean(name)
                : text(name);
      sql.push(`"${name}" ${type}${key === "id" ? " PRIMARY KEY" : ""}`);
    }
    schema[table.modelName] = pgTable(table.modelName, columns);
    await client.unsafe(`CREATE TABLE "${table.modelName}" (${sql.join(",")})`);
  }
  server = createSecFnServer({
    db: drizzleAdapter({
      db: drizzle(client, { schema }),
      dialect: "postgres",
    }),
    encryption: { masterKey: "test" },
    authorize: async () => true,
  });
});
afterAll(async () => {
  if (client) {
    if (created) await client.unsafe(`DROP SCHEMA ${schemaName} CASCADE`);
    await client.end();
  }
});
it.skipIf(!url)(
  "rolls back all set members on insertion and deletion failure, and permits retry",
  async () => {
    const v = server.vault;
    const first = await v.createSecret({
      tenantId: "t",
      namespace: "n",
      key: "A",
      value: "a",
      createdBy: "test",
    });
    const second = await v.createSecret({
      tenantId: "t",
      namespace: "n",
      key: "B",
      value: "b",
      createdBy: "test",
    });
    await client!.unsafe(
      `CREATE FUNCTION reject_member() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.alias='fail' THEN RAISE EXCEPTION 'injected member failure'; END IF; RETURN NEW; END $$`,
    );
    await client!.unsafe(
      "CREATE TRIGGER reject_member BEFORE INSERT ON secfn_secret_set_members FOR EACH ROW EXECUTE FUNCTION reject_member()",
    );
    const input = {
      tenantId: "t",
      namespace: "n",
      name: "set",
      createdBy: "test",
      members: [{ secretId: first.id }, { secretId: second.id, alias: "fail" }],
    };
    await expect(v.createSecretSet(input)).rejects.toThrow();
    expect(await client!`SELECT * FROM secfn_secret_sets`).toHaveLength(0);
    expect(await client!`SELECT * FROM secfn_secret_set_members`).toHaveLength(
      0,
    );
    await client!.unsafe(
      "DROP TRIGGER reject_member ON secfn_secret_set_members",
    );
    const set = await v.createSecretSet(input);
    await client!.unsafe(
      `CREATE FUNCTION reject_set_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected deletion failure'; END $$`,
    );
    await client!.unsafe(
      "CREATE TRIGGER reject_set_delete BEFORE DELETE ON secfn_secret_sets FOR EACH ROW EXECUTE FUNCTION reject_set_delete()",
    );
    await expect(v.deleteSecretSet(set.id, "test")).rejects.toThrow();
    expect(await client!`SELECT * FROM secfn_secret_set_members`).toHaveLength(
      2,
    );
    expect(await client!`SELECT * FROM secfn_secret_sets`).toHaveLength(1);
    await client!.unsafe("DROP TRIGGER reject_set_delete ON secfn_secret_sets");
    await v.deleteSecretSet(set.id, "test");
    expect(await client!`SELECT * FROM secfn_secret_set_members`).toHaveLength(
      0,
    );
    expect(await client!`SELECT * FROM secfn_secret_sets`).toHaveLength(0);
  },
);
it.skipIf(!url)(
  "upgrades schema 2 in the selected schema and can run twice",
  async () => {
    await client!.unsafe("ALTER TABLE secfn_scan_runs DROP COLUMN tenant_id");
    await client!.unsafe("INSERT INTO secfn_scan_runs(id) VALUES ('legacy')");
    const migration = await readFile(
      new URL(
        "../../migrations/0003_scan_run_tenant_index.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await client!.unsafe(migration);
    await client!.unsafe(migration);
    expect(
      await client!`SELECT tenant_id FROM secfn_scan_runs WHERE id='legacy'`,
    ).toEqual([{ tenant_id: null }]);
    const indexes =
      await client!`SELECT indexdef FROM pg_indexes WHERE schemaname=${schemaName} AND indexname='idx_secfn_scan_runs_tenant'`;
    expect(indexes[0].indexdef).toContain("(tenant_id)");
  },
);
