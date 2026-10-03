import assert from "node:assert/strict";
import { test } from "node:test";
import { readSingleInventory, readDnsInventory, readRulesetInventory } from "./inventory.mjs";

// Shapes follow Cloudflare's public SinglePage/V4PagePaginationArray/
// CursorPagination contracts, not a fake universal page-count API.
for (const endpoint of ["workers/domains", "workers/routes", "pagerules"]) {
  test(`${endpoint}: complete arrays require no fabricated metadata or pagination parameters`, async () => {
    const rows = [{ id: "first" }, { id: "second" }];
    assert.deepEqual(await readSingleInventory(async (path) => {
      assert.equal(path, endpoint); return { result: rows };
    }, endpoint), rows);
  });
  for (const info of [{ total_count: 3 }, { total_pages: 2 }, { total_pages: 0 }, { page: 2 }, { cursor: "later" }, { cursor: 0 }, { cursors: { after: "later" } }, { count: 0 }]) {
    test(`${endpoint}: advertised truncation/contradiction fails closed ${JSON.stringify(info)}`, async () => {
      await assert.rejects(readSingleInventory(async () => ({ result: [{ id: "first" }], result_info: info }), endpoint), /Incomplete/);
    });
  }
}
test("DNS traverses numeric pages and rejects changing counts/duplicate IDs/truncation", async () => {
  const rows = [{ id: "first" }, { id: "late-conflict" }];
  const calls = [];
  const get = async (path) => {
    calls.push(path); const page = Number(new URL(path, "https://api.cloudflare.com").searchParams.get("page"));
    return { result: [rows[page - 1]], result_info: { page, total_count: 2, total_pages: 2, count: 1 } };
  };
  assert.deepEqual(await readDnsInventory(get, "/dns"), rows);
  assert(calls.some((path) => new URL(path, "https://api.cloudflare.com").searchParams.get("page") === "2"));
  for (const corrupt of [
    (payload) => ({ ...payload, result_info: { ...payload.result_info, total_count: 3 } }),
    (payload) => ({ ...payload, result: [{ id: "first" }] }),
    (payload) => ({ ...payload, result: [], result_info: { ...payload.result_info, count: 0 } }),
  ]) {
    await assert.rejects(readDnsInventory(async (path) => {
      const payload = await get(path); return path.includes("page=2") ? corrupt(payload) : payload;
    }, "/dns"), /Incomplete/);
  }
});
test("Rulesets traverses escaped opaque cursors; unpaginated terminal metadata is optional", async () => {
  const calls = []; const cursor = "next/+?&=";
  const result = await readRulesetInventory(async (path) => {
    calls.push(path);
    if (path === "/rulesets") return { result: [{ id: "managed" }], result_info: { cursor, count: 1 } };
    assert.equal(new URL(path, "https://api.cloudflare.com").searchParams.get("cursor"), cursor);
    return { result: [{ id: "late-origin-conflict" }], result_info: { count: 1 } };
  }, "/rulesets");
  assert.deepEqual(result.map((row) => row.id), ["managed", "late-origin-conflict"]);
  assert(calls.some((path) => path.includes("?cursor=")));
  assert.deepEqual(await readRulesetInventory(async () => ({ result: [] }), "/rulesets"), []);
});
for (const corruption of ["duplicate", "cycle", "empty-continuation", "non-string-cursor"]) {
  test(`Rulesets fails closed on ${corruption}`, async () => {
    let reads = 0;
    await assert.rejects(readRulesetInventory(async () => {
      reads++;
      return {
        result: corruption === "empty-continuation" ? [] : [{ id: corruption === "duplicate" ? "same" : `row-${reads}` }],
        result_info: { cursor: corruption === "non-string-cursor" ? 42 : "repeated" },
      };
    }, "/rulesets"), /Incomplete/);
  });
}
for (const reader of [readSingleInventory, readDnsInventory, readRulesetInventory]) {
  test(`${reader.name}: malformed/duplicate rows never permit publication`, async () => {
    for (const result of [null, [{ id: "same" }, { id: "same" }], [{}], [null]]) {
      await assert.rejects(reader(async () => ({ result, result_info: { page: 1, total_count: 0 } }), "/inventory"), /Incomplete/);
    }
  });
}
