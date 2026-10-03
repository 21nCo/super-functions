// Cloudflare inventories have distinct public API contracts: Domains/Routes
// and Page Rules return complete arrays; DNS uses pages; Rulesets uses cursors.
// A failed/incomplete read must never become authority to mutate a hostname.
function append(payload, rows, ids) {
  if (!Array.isArray(payload.result)) throw new Error("Incomplete docs ownership inventory");
  for (const row of payload.result) {
    if (!row || typeof row.id !== "string" || !row.id || ids.has(row.id)) {
      throw new Error("Incomplete or changing docs ownership inventory");
    }
    ids.add(row.id);
    rows.push(row);
  }
  const info = payload.result_info ?? {};
  if (typeof info !== "object" || Array.isArray(info) ||
      (info.count !== undefined && info.count !== payload.result.length)) {
    throw new Error("Incomplete docs ownership inventory metadata");
  }
  return info;
}

function assertTerminal(info, size) {
  if ((info.page !== undefined && info.page !== 1) ||
      (info.total_pages !== undefined && (!Number.isSafeInteger(info.total_pages) || info.total_pages < 0 || info.total_pages > 1 || (info.total_pages === 0 && size > 0))) ||
      (info.total_count !== undefined && info.total_count !== size) ||
      (info.cursor !== undefined && info.cursor !== null && info.cursor !== "") ||
      (info.cursors?.after !== undefined && info.cursors.after !== null && info.cursors.after !== "")) {
    throw new Error("Incomplete docs ownership inventory metadata");
  }
}

function checkedTotal(value, previous, size, required = true) {
  if (!required && value === undefined) value = previous;
  if (!required && value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || value < size || (previous !== undefined && previous !== value)) {
    throw new Error("Incomplete or changing docs ownership inventory");
  }
  return value;
}

export async function readSingleInventory(get, pathname) {
  const rows = [];
  const info = append(await get(pathname), rows, new Set());
  // Do not invent required pagination metadata or unsupported query parameters.
  // If a server explicitly advertises truncation, fail rather than ignoring it.
  assertTerminal(info, rows.length);
  return rows;
}

export async function readDnsInventory(get, pathname) {
  const rows = []; const ids = new Set();
  let total;
  for (let page = 1; page <= 1000; page++) {
    const payload = await get(`${pathname}?per_page=50&page=${page}`);
    const info = append(payload, rows, ids);
    if (info.page !== page) throw new Error("Incomplete or changing docs ownership inventory");
    total = checkedTotal(info.total_count, total, rows.length);
    if (rows.length === total) {
      if (info.total_pages !== undefined && info.total_pages !== page && !(total === 0 && info.total_pages === 0)) {
        throw new Error("Incomplete docs ownership inventory metadata");
      }
      return rows;
    }
    if (!payload.result.length || rows.length > total) break;
  }
  throw new Error("Incomplete docs ownership inventory");
}

export async function readRulesetInventory(get, pathname) {
  const rows = []; const ids = new Set(); const cursors = new Set();
  let cursor;
  let total;
  for (let page = 0; page < 1000; page++) {
    const suffix = cursor === undefined ? "" : `?cursor=${encodeURIComponent(cursor)}`;
    const payload = await get(pathname + suffix);
    const info = append(payload, rows, ids);
    if (info.cursor !== undefined && info.cursor !== null && typeof info.cursor !== "string") {
      throw new Error("Incomplete docs ownership inventory cursor");
    }
    total = checkedTotal(info.total_count, total, rows.length, false);
    const next = info.cursor;
    if (!next) {
      assertTerminal({ ...info, cursor: undefined, total_count: total }, rows.length);
      return rows;
    }
    if (!payload.result.length || cursors.has(next)) throw new Error("Incomplete or changing docs ownership inventory cursor");
    cursors.add(next);
    cursor = next;
  }
  throw new Error("Incomplete docs ownership inventory");
}
