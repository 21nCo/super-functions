import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
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
const schemaName = `rex_contract_${randomUUID().replaceAll("-", "")}`;
let created = false;
const client = url ? postgres(url, { max: 4, connection: { search_path: schemaName }, onnotice: () => {} }) : undefined;
let server: ReturnType<typeof createSecFnServer>;
let database: ReturnType<typeof drizzleAdapter>;
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
  database = drizzleAdapter({ db: drizzle(client, { schema }), dialect: "postgres" });
  server = createSecFnServer({
    db: database,
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
    const migrationConnection = await client!.reserve();
    try {
      await migrationConnection.unsafe(migration);
      await migrationConnection.unsafe(migration);
    } finally {
      await migrationConnection.unsafe("ROLLBACK");
      migrationConnection.release();
    }
    expect(
      await client!`SELECT tenant_id FROM secfn_scan_runs WHERE id='legacy'`,
    ).toEqual([{ tenant_id: null }]);
    const indexes =
      await client!`SELECT indexdef FROM pg_indexes WHERE schemaname=${schemaName} AND indexname='idx_secfn_scan_runs_tenant'`;
    expect(indexes[0].indexdef).toContain("(tenant_id)");
  },
);

it.skipIf(!url)(
  "persists set environment bindings and rejects cross-environment membership",
  async () => {
    const v = server.vault;
    const scope = {
      tenantId: "bound-test",
      namespace: "bound",
      createdBy: "test",
    };
    const prod = await v.createSecret({
      ...scope,
      environment: "production",
      key: "PROD",
      value: "prod",
    });
    const stage = await v.createSecret({
      ...scope,
      environment: "staging",
      key: "STAGE",
      value: "stage",
    });
    await expect(
      v.createSecretSet({
        ...scope,
        environment: "production",
        name: "bad",
        members: [{ secretId: stage.id }],
      }),
    ).rejects.toThrow("scope mismatch");
    const set = await v.createSecretSet({
      ...scope,
      environment: "production",
      name: "app",
      members: [{ secretId: prod.id }],
    });
    expect((await v.getSecretSet(set.id)).environmentId).toBe(
      prod.environmentId,
    );
    await expect(v.addSecretSetMember(set.id, stage.id)).rejects.toThrow(
      "scope mismatch",
    );
    const [member] = await v.listSecretSetMembers(set.id);
    await expect(
      v.updateSecretSetMember(member.id, { secretId: stage.id }),
    ).rejects.toThrow("scope mismatch");
    expect((await v.listSecretSetMembers(set.id))[0].secretId).toBe(prod.id);
    const issued = await v.createServiceToken({
      ...scope,
      name: "runtime",
      scopes: ["set:app"],
    });
    const runtimeScope = { ...scope, environment: "production" };
    const verified = await v.verifyRuntimeToken(issued.token, runtimeScope);
    expect(
      (await v.resolveRuntimeSet("app", verified, runtimeScope)).secrets,
    ).toEqual({ PROD: "prod" });
    await expect(
      v.resolveRuntimeSet("app", verified, {
        ...scope,
        environment: "staging",
      }),
    ).rejects.toThrow("Secret set not found");
  },
);
it.skipIf(!url)(
  "aggregates more than 10,000 durable audit events",
  async () => {
    await client!.unsafe(
      "INSERT INTO secfn_audit_events (id,timestamp,type,severity,resolved) SELECT 'metric-' || lpad(i::text,6,'0'), now(), 'metric-test', 'info', false FROM generate_series(1,10001) i",
    );
    const expected =
      await client!`SELECT count(*)::int AS n FROM secfn_audit_events`;
    const metrics = await server.audit.getMetrics();
    expect(metrics.totalEvents).toBe(expected[0].n);
    expect(metrics.eventsByType["metric-test"]).toBe(10001);
  },
);
it.skipIf(!url)("migrates a schema outside search_path twice and enforces environment identity", async () => {
  const migrationSchema = `rex_upgrade_${randomUUID().replaceAll("-", "")}`;
  const migrationClient = postgres(url!, { max: 1, onnotice: () => {} });
  try {
    await migrationClient.unsafe(`CREATE SCHEMA ${migrationSchema}`);
    await migrationClient.unsafe(`CREATE TABLE ${migrationSchema}.secfn_secret_sets (id text PRIMARY KEY, tenant_id text, namespace_id text, name text)`);
    await migrationClient.unsafe(`INSERT INTO ${migrationSchema}.secfn_secret_sets VALUES ('legacy', 'tenant', 'namespace', 'app')`);
    await migrationClient`SELECT set_config('secfn.migration_schema', ${migrationSchema}, false)`;
    const migration = await readFile(new URL("../../migrations/0004_secret_set_environment.sql", import.meta.url), "utf8");
    await migrationClient.unsafe(migration);
    await migrationClient.unsafe(migration);
    expect((await migrationClient.unsafe(`SELECT environment_id FROM ${migrationSchema}.secfn_secret_sets`))[0].environment_id).toBeNull();
    await migrationClient.unsafe(`INSERT INTO ${migrationSchema}.secfn_secret_sets VALUES ('production', 'tenant', 'namespace', 'app', 'prod'), ('staging', 'tenant', 'namespace', 'app', 'stage')`);
    await expect(migrationClient.unsafe(`INSERT INTO ${migrationSchema}.secfn_secret_sets VALUES ('duplicate', 'tenant', 'namespace', 'app', 'prod')`)).rejects.toMatchObject({code:'23505'});
    await expect(migrationClient.unsafe(`INSERT INTO ${migrationSchema}.secfn_secret_sets VALUES ('duplicate-legacy', 'tenant', 'namespace', 'app', null)`)).rejects.toMatchObject({code:'23505'});
  } finally {
    await migrationClient.unsafe('ROLLBACK');
    await migrationClient.unsafe(`DROP SCHEMA IF EXISTS ${migrationSchema} CASCADE`);
    await migrationClient.end();
  }
});

it.skipIf(!url)("derives ownership and resolves same-name sets per environment including legacy fallback", async () => {
  const v = server.vault;
  const ns = await v.createNamespace({tenantId:"identity",slug:"identity",createdBy:"test"});
  const prod = await v.createEnvironment({namespaceId:ns.id,name:"production",createdBy:"test"});
  const stage = await v.createEnvironment({namespaceId:ns.id,name:"staging",createdBy:"test"});
  expect(prod.tenantId).toBe("identity");
  const secret = await v.createSecret({environmentId:prod.id,key:"KEY",value:"prod",createdBy:"test"});
  expect(secret.tenantId).toBe("identity");
  const staged = await v.createSecret({namespaceId:ns.id,environmentId:stage.id,key:"KEY",value:"stage",createdBy:"test"});
  expect(staged.tenantId).toBe("identity");
  const legacy = await v.createSecretSet({namespaceId:ns.id,name:"app",createdBy:"test"});
  const bound = await v.createSecretSet({namespaceId:ns.id,environmentId:prod.id,name:"app",members:[{secretId:secret.id}],createdBy:"test"});
  await v.createSecretSet({namespaceId:ns.id,environmentId:stage.id,name:"app",members:[{secretId:staged.id}],createdBy:"test"});
  expect((await v.listSecretSets({namespaceId:ns.id,environmentId:prod.id})).map(set=>set.id)).toEqual([bound.id]);
  await expect(v.createSecretSet({namespaceId:ns.id,environmentId:prod.id,name:"app",createdBy:"test"})).rejects.toThrow("already exists");
  const issued = await v.createServiceToken({tenantId:"identity",namespaceId:ns.id,name:"token",scopes:["set:app"],createdBy:"test"});
  for (const [environmentId,value] of [[prod.id,"prod"],[stage.id,"stage"]]) {
    const scope = {tenantId:"identity",namespaceId:ns.id,environmentId};
    const verified = await v.verifyRuntimeToken(issued.token,scope);
    expect((await v.resolveRuntimeSet("app",verified,scope)).secrets).toEqual({KEY:value});
  }
  await v.deleteSecretSet(bound.id,"test");
  const scope = {tenantId:"identity",namespaceId:ns.id,environmentId:prod.id};
  expect((await v.resolveRuntimeSet("app",await v.verifyRuntimeToken(issued.token,scope),scope)).secrets).toEqual({});
  expect((await v.getSecretSet(legacy.id)).name).toBe("app");
});

it.skipIf(!url)("lists and resolves all 1001 members instead of silently truncating", async () => {
  const v = server.vault;
  const scope = {tenantId:"large",namespace:"large",environment:"production",createdBy:"test"};
  const secret = await v.createSecret({...scope,key:"VALUE",value:"test"});
  const set = await v.createSecretSet({...scope,name:"large"});
  await client!`INSERT INTO secfn_secret_set_members(id,set_id,secret_id,alias,created_at) SELECT 'large-' || lpad(i::text,6,'0'), ${set.id}, ${secret.id}, 'KEY_' || i::text, now() FROM generate_series(1,1001) i`;
  expect(await v.listSecretSetMembers(set.id)).toHaveLength(1001);
  await expect(v.addSecretSetMember(set.id, secret.id, "KEY_1001")).rejects.toThrow("unique");
  const issued = await v.createServiceToken({...scope,name:"token",scopes:["set:large"]});
  const result = await v.resolveRuntimeSet("large",await v.verifyRuntimeToken(issued.token,scope),scope);
  expect(Object.keys(result.secrets)).toHaveLength(1001);
  expect(result.secrets.KEY_1001).toBe("test");
},60000);

it.skipIf(!url)("holds a stable audit snapshot across a backdated late commit", async () => {
  const writer = postgres(url!, { max: 1, onnotice: () => {} });
  let commit!: () => void;
  let ready!: () => void;
  const readyPromise = new Promise<void>(resolve => { ready = resolve; });
  const commitPromise = new Promise<void>(resolve => { commit = resolve; });
  const write = writer.begin(async sql => {
    await sql.unsafe(`INSERT INTO ${schemaName}.secfn_audit_events (id,timestamp,type,severity,resolved) VALUES ('aaa-late','1999-01-01','late-commit','info',false),('zzz-late','1999-01-01','late-commit','info',false)`);
    ready();
    await commitPromise;
  });
  const transaction = database.transaction.bind(database);
  try {
    await Promise.race([readyPromise, write]);
    const expected = (await client!`SELECT count(*)::int AS n FROM secfn_audit_events`)[0].n;
    let committed = false;
    database.transaction = (callback, options) => transaction(async trx => {
      expect(options?.isolationLevel).toBe("repeatable_read");
      const findMany = trx.findMany.bind(trx);
      trx.findMany = async params => {
        const rows = await findMany(params);
        if (params.model === "secfn_audit_events" && !committed) {
          committed = true;
          commit();
          await write;
        }
        return rows;
      };
      return callback(trx);
    }, options);
    expect((await server.audit.getMetrics()).totalEvents).toBe(expected);
    expect((await server.audit.getMetrics()).totalEvents).toBe(expected + 2);
  } finally {
    commit();
    await write;
    database.transaction = transaction;
    await writer.end();
  }
});

it.skipIf(!url)("serializes conflicting member additions and replacements", async () => {
  const v = server.vault;
  const scope = {tenantId:"concurrent",namespace:"concurrent",environment:"production",createdBy:"test"};
  const one = await v.createSecret({...scope,key:"ONE",value:"one"});
  const two = await v.createSecret({...scope,key:"TWO",value:"two"});
  const set = await v.createSecretSet({...scope,name:"concurrent"});
  const results = await Promise.allSettled([v.addSecretSetMember(set.id,one.id,"SAME"),v.addSecretSetMember(set.id,two.id,"SAME")]);
  expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
  expect(await v.listSecretSetMembers(set.id)).toHaveLength(1);
  const a = await v.addSecretSetMember(set.id,one.id,"A");
  const b = await v.addSecretSetMember(set.id,two.id,"B");
  const updates = await Promise.allSettled([v.updateSecretSetMember(a.id,{alias:"RENAMED"}),v.updateSecretSetMember(b.id,{alias:"RENAMED"})]);
  expect(updates.filter(r=>r.status==="fulfilled")).toHaveLength(1);
  expect((await v.listSecretSetMembers(set.id)).filter(m=>m.alias==="RENAMED")).toHaveLength(1);
});

it.skipIf(!url)("preflights duplicate legacy sets without deleting their data", async () => {
  const name = `rex_duplicates_${randomUUID().replaceAll("-","")}`;
  const sql = postgres(url!,{max:1,onnotice:()=>{}});
  try {
    await sql.unsafe(`CREATE SCHEMA ${name}`);
    await sql.unsafe(`CREATE TABLE ${name}.secfn_secret_sets(id text PRIMARY KEY, tenant_id text, namespace_id text, name text)`);
    await sql.unsafe(`CREATE UNIQUE INDEX idx_secfn_secret_sets_lookup ON ${name}.secfn_secret_sets(tenant_id,namespace_id,name)`);
    await sql.unsafe(`INSERT INTO ${name}.secfn_secret_sets VALUES ('one',null,'ns','app'),('two',null,'ns','app')`);
    await sql`SELECT set_config('secfn.migration_schema',${name},false)`;
    const migration = await readFile(new URL("../../migrations/0004_secret_set_environment.sql",import.meta.url),"utf8");
    await expect(sql.unsafe(migration)).rejects.toMatchObject({code:"23505",message:"SecFn schema 4 has duplicate secret-set identities"});
    await sql.unsafe("ROLLBACK");
    expect((await sql.unsafe(`SELECT count(*)::int AS n FROM ${name}.secfn_secret_sets`))[0].n).toBe(2);
    expect((await sql`SELECT count(*)::int AS n FROM pg_indexes WHERE schemaname=${name} AND indexname='idx_secfn_secret_sets_lookup'`)[0].n).toBe(1);
    // Explicit operator-selected names preserve both records and member IDs.
    await sql.unsafe(`UPDATE ${name}.secfn_secret_sets SET name=id`);
    await sql.unsafe(migration);
    expect((await sql.unsafe(`SELECT name FROM ${name}.secfn_secret_sets ORDER BY name`)).map(r=>r.name)).toEqual(['one','two']);
  } finally {
    await sql.unsafe("ROLLBACK");
    await sql.unsafe(`DROP SCHEMA IF EXISTS ${name} CASCADE`);
    await sql.end();
  }
});
