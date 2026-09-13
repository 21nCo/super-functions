import { describe, expect, it } from "vitest";
import { ComposioLinearContextAdapter, type ComposioRunner } from "../src/index.js";

const request = { root: ".", issue: "ENG-1", account: "work", expectedWorkspace: "workspace-1", limits: { maxSources: 20, maxBytes: 100_000, maxDepth: 3 } };

describe("ComposioLinearContextAdapter", () => {
  it("requires explicit account and workspace", async () => {
    const adapter = new ComposioLinearContextAdapter({ runner: async () => ({ code: 0, stdout: "0.4.1", stderr: "" }) });
    const result = await adapter.preflight({ ...request, account: undefined, expectedWorkspace: undefined });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((item) => item.code)).toContain("REVIEWFN_COMPOSIO_ACCOUNT_REQUIRED");
  });
  it("captures issue comments and attached document content", async () => {
    const runner: ComposioRunner = async (args) => {
      if (args[0] === "--version") return { code: 0, stdout: "0.4.1", stderr: "" };
      const slug = args[1];
      if (slug === "LINEAR_GET_LINEAR_ISSUE") return { code: 0, stderr: "", stdout: JSON.stringify({ data: { issue: { id: "i1", identifier: "ENG-1", title: "Feature", description: "Do it", url: "https://linear.app/x/ENG-1", organization: { id: "workspace-1", name: "Acme" }, comments: { nodes: [{ id: "c1", body: "clarify" }], pageInfo: { hasNextPage: false } }, documents: { nodes: [{ id: "d1", title: "Design" }], pageInfo: { hasNextPage: false } } } } }) };
      return { code: 0, stderr: "", stdout: JSON.stringify({ data: { document: { id: "d1", title: "Design", content: "architecture" } } }) };
    };
    const result = await new ComposioLinearContextAdapter({ runner }).fetch(request);
    expect(result.sources.map((source) => source.type)).toEqual(["issue", "comment", "document"]);
    expect(result.incompleteReasons).toEqual([]);
  });
  it("rejects the wrong workspace instead of returning empty context", async () => {
    const runner: ComposioRunner = async () => ({ code: 0, stderr: "", stdout: JSON.stringify({ issue: { id: "i", identifier: "ENG-1", title: "x", description: "x", organization: { id: "other" } } }) });
    await expect(new ComposioLinearContextAdapter({ runner }).fetch(request)).rejects.toThrow(/workspace mismatch/);
  });
  it("records inaccessible document content as incomplete", async () => {
    const runner: ComposioRunner = async (args) => args[1] === "LINEAR_GET_LINEAR_ISSUE"
      ? { code: 0, stderr: "", stdout: JSON.stringify({ issue: { id: "i", identifier: "ENG-1", title: "x", description: "x", organization: { id: "workspace-1" }, documents: { nodes: [{ id: "d" }] } } }) }
      : { code: 1, stdout: "", stderr: "permission denied" };
    const result = await new ComposioLinearContextAdapter({ runner }).fetch(request);
    expect(result.sources.some((source) => source.type === "document" && source.status === "failed")).toBe(true);
    expect(result.incompleteReasons).toContain("Unable to fetch Linear document d.");
  });
  it("follows comment and document cursors before declaring context complete", async () => {
    const calls: Array<{ slug: string; data: Record<string, unknown> }> = [];
    const runner: ComposioRunner = async (args) => {
      const slug = args[1];
      const data = JSON.parse(args[args.indexOf("-d") + 1]) as Record<string, unknown>;
      calls.push({ slug, data });
      if (slug === "LINEAR_GET_LINEAR_ISSUE") return { code: 0, stderr: "", stdout: JSON.stringify({ issue: { id: "i", identifier: "ENG-1", title: "x", description: "x", organization: { id: "workspace-1" }, comments: { nodes: [{ id: "c1", body: "first" }], pageInfo: { hasNextPage: true, endCursor: "comments-next" } }, documents: { nodes: [], pageInfo: { hasNextPage: true, endCursor: "documents-next" } } } }) };
      const variables = data.variables as { after?: string; id?: string };
      if (variables.after === "comments-next") return { code: 0, stderr: "", stdout: JSON.stringify({ data: { issue: { id: "i", comments: { nodes: [{ id: "c2", body: "second" }], pageInfo: { hasNextPage: false } } } } }) };
      if (variables.after === "documents-next") return { code: 0, stderr: "", stdout: JSON.stringify({ data: { issue: { id: "i", documents: { nodes: [{ id: "d1", title: "Design", content: "full design" }], pageInfo: { hasNextPage: false } } } } }) };
      throw new Error(`unexpected call ${JSON.stringify({ slug, data })}`);
    };
    const result = await new ComposioLinearContextAdapter({ runner }).fetch(request);
    expect(result.sources.filter((source) => source.type === "comment")).toHaveLength(2);
    expect(result.sources.find((source) => source.type === "document")?.content).toBe("full design");
    expect(result.incompleteReasons).toEqual([]);
    expect(calls.filter((call) => call.slug === "LINEAR_RUN_QUERY_OR_MUTATION")).toHaveLength(2);
  });
});
it("retrieves live-shaped linked specifications and explicit comment pagination", async () => {
  const calls: string[] = [];
  const runner: ComposioRunner = async args => {
    calls.push(args[1]); const data = JSON.parse(args[args.indexOf("-d") + 1]);
    const payload = args[1] === "LINEAR_GET_LINEAR_ISSUE"
      ? { successful: true, data: { issue: { id: "i", identifier: "ENG-1", title: "Feature", url: "https://linear.app/acme/issue/ENG-1", description: "Read https://linear.app/acme/document/design-abcdef123456", team: { name: "workspace-1" }, comments: { nodes: [] } } } }
      : data.query_or_mutation.includes("comments(")
        ? { data: { data: { issue: { id: "i", comments: { nodes: [{ id: "c", body: "clarification" }], pageInfo: { hasNextPage: false } } } } } }
        : data.query_or_mutation.includes("documents(") ? { data: { data: { issue: { id: "i", documents: { nodes: [], pageInfo: { hasNextPage: false } } } } } } : { data: { data: { document: { id: "doc", slugId: "abcdef123456", title: "Design", url: "https://linear.app/acme/document/design-abcdef123456", content: "must preserve compatibility" } } } };
    return { code: 0, stdout: JSON.stringify(payload), stderr: "" };
  };
  const result = await new ComposioLinearContextAdapter({ runner }).fetch(request);
  expect(result.sources.map(source => source.type)).toEqual(["issue", "comment", "document"]); expect(result.incompleteReasons).toEqual([]); expect(calls).toHaveLength(5);
});

it("does not accept another workspace identity from nested comment metadata", async () => {
  const runner: ComposioRunner = async () => ({ code: 0, stderr: "", stdout: JSON.stringify({ issue: { id: "i", identifier: "ENG-1", title: "wrong issue", description: "x", organization: { id: "workspace-A" }, comments: { nodes: [{ body: "x", user: { organization: { id: "workspace-1" } } }] } } }) });
  await expect(new ComposioLinearContextAdapter({ runner }).fetch(request)).rejects.toThrow(/workspace mismatch/);
});

it("deduplicates document UUID and URL aliases", async () => {
  const url = "https://linear.app/acme/document/design-abcdef123456";
  const runner: ComposioRunner = async () => ({ code: 0, stderr: "", stdout: JSON.stringify({ issue: { id: "i", identifier: "ENG-1", title: "x", url: "https://linear.app/acme/issue/ENG-1", description: url, organization: { id: "workspace-1" }, comments: { nodes: [], pageInfo: { hasNextPage: false } }, documents: { nodes: [{ id: "uuid", title: "Design", url, content: "requirements" }], pageInfo: { hasNextPage: false } } } }) });
  const result = await new ComposioLinearContextAdapter({ runner }).fetch(request);
  expect(result.sources.filter(source => source.type === "document")).toHaveLength(1);
  expect(result.incompleteReasons).toEqual([]);
});

it("does not spend pagination budget on duplicate initial documents", async () => {
  let pages = 0;
  const runner: ComposioRunner = async args => {
    if (args[1] === "LINEAR_GET_LINEAR_ISSUE") return { code: 0, stderr: "", stdout: JSON.stringify({ issue: { id: "i", identifier: "ENG-1", title: "x", description: "requirements", organization: { id: "workspace-1" }, comments: { nodes: [], pageInfo: { hasNextPage: false } }, documents: { nodes: [{ id: "d1", content: "one" }, { id: "d2", content: "two" }], pageInfo: { hasNextPage: true, endCursor: "next" } } } }) };
    pages++; return { code: 0, stderr: "", stdout: JSON.stringify({ issue: { id: "i", documents: { nodes: [{ id: "d3", content: "three" }], pageInfo: { hasNextPage: false } } } }) };
  };
  const result = await new ComposioLinearContextAdapter({ runner }).fetch({ ...request, limits: { ...request.limits, maxSources: 4 } });
  expect(pages).toBe(1); expect(result.sources.filter(source => source.type === "document")).toHaveLength(3); expect(result.incompleteReasons).toEqual([]);
});

it("rejects a different issue in the same workspace", async () => {
  const runner: ComposioRunner = async () => ({ code: 0, stderr: "", stdout: JSON.stringify({ issue: { id: "other", identifier: "ENG-2", title: "Wrong", organization: { id: "workspace-1" } } }) });
  await expect(new ComposioLinearContextAdapter({ runner }).fetch(request)).rejects.toThrow(/no accessible Linear issue/);
});

it("rejects cross-workspace links before fetching their documents", async () => {
  let documentReads = 0;
  const runner: ComposioRunner = async args => {
    if (args[1] !== "LINEAR_GET_LINEAR_ISSUE") { documentReads++; throw new Error("must not read foreign document"); }
    return { code: 0, stderr: "", stdout: JSON.stringify({ issue: { id: "i", identifier: "ENG-1", title: "x", url: "https://linear.app/acme/issue/ENG-1", description: "https://linear.app/foreign/document/private-abcdef123456", organization: { id: "workspace-1" }, comments: { nodes: [], pageInfo: { hasNextPage: false } }, documents: { nodes: [], pageInfo: { hasNextPage: false } } } }) };
  };
  const result = await new ComposioLinearContextAdapter({ runner }).fetch(request);
  expect(documentReads).toBe(0); expect(result.sources).toHaveLength(1); expect(result.incompleteReasons.join()).toMatch(/workspace/);
});
it("uses richer paginated records in place of URL-only placeholders", async () => {
  let documentReads = 0; const url = "https://linear.app/acme/document/design-abcdef123456";
  const runner: ComposioRunner = async args => {
    if (args[1] === "LINEAR_GET_LINEAR_ISSUE") return { code: 0, stderr: "", stdout: JSON.stringify({ issue: { id: "i", identifier: "ENG-1", title: "x", url: "https://linear.app/acme/issue/ENG-1", description: url, organization: { id: "workspace-1" }, comments: { nodes: [], pageInfo: { hasNextPage: false } }, documents: { nodes: [], pageInfo: { hasNextPage: true, endCursor: "next" } } } }) };
    const data = JSON.parse(args[args.indexOf("-d") + 1]);
    if (data.query_or_mutation.includes("document(id:")) { documentReads++; throw new Error("unnecessary document fetch"); }
    return { code: 0, stderr: "", stdout: JSON.stringify({ issue: { id: "i", documents: { nodes: [{ id: "provider-uuid", title: "Design", url, content: "full specification" }], pageInfo: { hasNextPage: false } } } }) };
  };
  const result = await new ComposioLinearContextAdapter({ runner }).fetch(request);
  expect(documentReads).toBe(0); expect(result.sources.find(source => source.type === "document")?.id).toBe("linear:document:provider-uuid"); expect(result.incompleteReasons).toEqual([]);
});

it("verifies the server-returned workspace before reading a linked document body", async () => {
  let contentReads = 0;
  const runner: ComposioRunner = async args => {
    if (args[1] === "LINEAR_GET_LINEAR_ISSUE") return { code: 0, stderr: "", stdout: JSON.stringify({ issue: { id: "i", identifier: "ENG-1", title: "x", url: "https://linear.app/acme/issue/ENG-1", description: "https://linear.app/acme/document/forged-abcdef123456", organization: { id: "workspace-1" }, comments: { nodes: [], pageInfo: { hasNextPage: false } }, documents: { nodes: [], pageInfo: { hasNextPage: false } } } }) };
    const data = JSON.parse(args[args.indexOf("-d") + 1]);
    if (data.query_or_mutation.includes("content")) contentReads++;
    return { code: 0, stderr: "", stdout: JSON.stringify({ document: { id: "uuid", slugId: "abcdef123456", title: "private", url: "https://linear.app/foreign/document/private-abcdef123456" } }) };
  };
  const result = await new ComposioLinearContextAdapter({ runner }).fetch(request);
  expect(contentReads).toBe(0); expect(result.sources).toHaveLength(1); expect(result.incompleteReasons.join()).toMatch(/before reading content/);
});

it("resolves the canonical issue URL when the issue tool omits it", async () => {
  const url = "https://linear.app/acme/document/design-abcdef123456";
  const runner: ComposioRunner = async args => {
    if (args[1] === "LINEAR_GET_LINEAR_ISSUE") return { code: 0, stderr: "", stdout: JSON.stringify({ issue: { id: "i", identifier: "ENG-1", title: "x", description: url, organization: { id: "workspace-1" }, comments: { nodes: [], pageInfo: { hasNextPage: false } }, documents: { nodes: [], pageInfo: { hasNextPage: false } } } }) };
    const data = JSON.parse(args[args.indexOf("-d") + 1]);
    const payload = data.query_or_mutation.includes("issue(id:") ? { issue: { id: "i", identifier: "ENG-1", title: "x", url: "https://linear.app/acme/issue/ENG-1" } } : { document: { id: "uuid", slugId: "abcdef123456", title: "Design", url, content: "requirements" } };
    return { code: 0, stderr: "", stdout: JSON.stringify(payload) };
  };
  const result = await new ComposioLinearContextAdapter({ runner }).fetch(request);
  expect(result.sources[0].canonicalUrl).toBe("https://linear.app/acme/issue/ENG-1"); expect(result.sources).toHaveLength(2); expect(result.incompleteReasons).toEqual([]);
});

it("propagates cancellation during canonical issue lookup", async () => {
  const controller = new AbortController();
  const runner: ComposioRunner = async args => {
    if (args[1] === "LINEAR_GET_LINEAR_ISSUE") return { code: 0, stderr: "", stdout: JSON.stringify({ issue: { id: "i", identifier: "ENG-1", title: "x", description: "https://linear.app/acme/document/design-abcdef123456", organization: { id: "workspace-1" }, comments: { nodes: [], pageInfo: { hasNextPage: false } }, documents: { nodes: [], pageInfo: { hasNextPage: false } } } }) };
    controller.abort(); throw new Error("canceled");
  };
  await expect(new ComposioLinearContextAdapter({ runner }).fetch({ ...request, signal: controller.signal })).rejects.toThrow(/canceled/);
});

it.each(["comments", "documents", "document-body"])("propagates cancellation during %s recovery", async stage => {
  const controller = new AbortController();
  const runner: ComposioRunner = async args => {
    if (args[1] === "LINEAR_GET_LINEAR_ISSUE") return { code: 0, stderr: "", stdout: JSON.stringify({ issue: { id: "i", identifier: "ENG-1", title: "x", organization: { id: "workspace-1" }, comments: stage === "comments" ? [] : { nodes: [], pageInfo: { hasNextPage: false } }, documents: stage === "documents" ? [] : { nodes: stage === "document-body" ? [{ id: "doc", title: "Design" }] : [], pageInfo: { hasNextPage: false } } } }) };
    controller.abort(); throw new Error("canceled");
  };
  await expect(new ComposioLinearContextAdapter({ runner }).fetch({ ...request, signal: controller.signal })).rejects.toThrow(/canceled/);
});

it("truncates Linear context at a complete UTF-8 boundary", async () => {
  const runner: ComposioRunner = async () => ({ code: 0, stderr: "", stdout: JSON.stringify({ issue: { id: "i", identifier: "ENG-1", title: "😀title", organization: { id: "workspace-1" }, comments: { nodes: [], pageInfo: { hasNextPage: false } }, documents: { nodes: [], pageInfo: { hasNextPage: false } } } }) });
  const adapter = new ComposioLinearContextAdapter({ runner });
  const full = await adapter.fetch(request);
  const maxBytes = Buffer.from(full.sources[0].content!).indexOf(Buffer.from("😀")) + 2;
  expect(maxBytes).toBeGreaterThan(2);
  const result = await adapter.fetch({ ...request, limits: { ...request.limits, maxBytes } });
  expect(result.sources[0].status).toBe("truncated");
  expect(Buffer.byteLength(result.sources[0].content!)).toBeLessThanOrEqual(maxBytes);
  expect(result.sources[0].content).not.toContain("�");
});


it.each(["comments", "documents"] as const)("binds fallback and paginated %s connections to the requested issue", async name => {
  let reads = 0;
  const adapter = new ComposioLinearContextAdapter({ runner: async args => {
    if (args[1] === "LINEAR_GET_LINEAR_ISSUE") return { code: 0, stderr: "", stdout: JSON.stringify({ issue: { id: "i", identifier: "ENG-1", title: "Requested", organization: { id: "workspace-1" }, [name === "comments" ? "documents" : "comments"]: { nodes: [], pageInfo: { hasNextPage: false } } } }) };
    const data = JSON.parse(args[args.indexOf("-d") + 1]);
    reads++;
    const node = name === "comments" ? { id: `safe-${reads}`, body: "correct issue" } : { id: `safe-${reads}`, title: "Design", content: "correct issue" };
    const connection = { nodes: [node], pageInfo: { hasNextPage: reads === 1, endCursor: reads === 1 ? "next" : null } };
    return { code: 0, stderr: "", stdout: JSON.stringify({ unrelated: { id: "other", [name]: { nodes: [{ id: "foreign", body: "wrong issue", title: "Wrong", content: "wrong issue" }], pageInfo: { hasNextPage: false } } }, data: { issue: { id: data.variables.issueId, [name]: connection } } }) };
  } });
  const output = await adapter.fetch(request);
  expect(reads).toBe(2);
  expect(output.sources.map(source => source.id)).toContain(`linear:${name === "comments" ? "comment" : "document"}:safe-2`);
  expect(JSON.stringify(output.sources)).not.toContain("wrong issue");
  expect(output.incompleteReasons).toEqual([]);
});


it("binds identifier-only initial issues without accepting an unrelated connection", async () => {
  const adapter = new ComposioLinearContextAdapter({ runner: async args => {
    if (args[1] === "LINEAR_GET_LINEAR_ISSUE") return { code: 0, stderr: "", stdout: JSON.stringify({ issue: { identifier: "ENG-1", title: "Requested", organization: { id: "workspace-1" }, documents: { nodes: [], pageInfo: { hasNextPage: false } } } }) };
    return { code: 0, stderr: "", stdout: JSON.stringify({ wrong: { id: "other", identifier: "ENG-2", comments: { nodes: [{ id: "foreign", body: "wrong" }], pageInfo: { hasNextPage: false } } }, data: { issue: { id: "uuid", identifier: "ENG-1", comments: { nodes: [{ id: "right", body: "correct" }], pageInfo: { hasNextPage: false } } } } }) };
  } });
  const output = await adapter.fetch(request);
  expect(output.sources.map(source => source.id)).toContain("linear:comment:right");
  expect(JSON.stringify(output.sources)).not.toContain("foreign");
  expect(output.incompleteReasons).toEqual([]);
});


it.each(["comments", "documents", "both"])("bounds empty %s pages with a shared connection budget", async scope => {
  let requests = 0;
  const adapter = new ComposioLinearContextAdapter({ runner: async args => {
    if (args[1] === "LINEAR_GET_LINEAR_ISSUE") return { code: 0, stderr: "", stdout: JSON.stringify({ issue: { id: "i", identifier: "ENG-1", title: "Requested", organization: { id: "workspace-1" }, comments: { nodes: [], pageInfo: { hasNextPage: scope !== "documents", endCursor: "comments-start" } }, documents: { nodes: [], pageInfo: { hasNextPage: scope !== "comments", endCursor: "documents-start" } } } }) };
    if (++requests > 3) throw new Error("Pagination exceeded the request budget");
    const data = JSON.parse(args[args.indexOf("-d") + 1]);
    const name = data.query_or_mutation.includes("comments(") ? "comments" : "documents";
    return { code: 0, stderr: "", stdout: JSON.stringify({ issue: { id: "i", [name]: { nodes: [], pageInfo: { hasNextPage: true, endCursor: `cursor-${requests}` } } } }) };
  } });
  const output = await adapter.fetch({ ...request, limits: { ...request.limits, maxSources: 3 } });
  expect(requests).toBe(3);
  expect(output.incompleteReasons.join()).toMatch(/request budget/);
});

it.each([false, true])("preserves document budgets when comment authority is disabled (%s)", async excludedType => {
  const runner: ComposioRunner = async args => {
    if (args[1] !== "LINEAR_GET_LINEAR_ISSUE") throw new Error("Disabled comments must not trigger pagination");
    return { code: 0, stderr: "", stdout: JSON.stringify({ issue: { id: "i", identifier: "ENG-1", title: "Feature", organization: { id: "workspace-1" }, comments: { nodes: Array.from({ length: 20 }, (_, i) => ({ id: `c${i}`, body: "x".repeat(10000) })), pageInfo: { hasNextPage: true, endCursor: "more" } }, documents: { nodes: [{ id: "d", title: "Spec", content: "Required behavior" }], pageInfo: { hasNextPage: false } } } }) };
  };
  const result = await new ComposioLinearContextAdapter({ runner }).fetch({ ...request, limits: { maxSources: 2, maxBytes: 1000, maxDepth: 3 }, sourceAuthority: { acceptedTypes: excludedType ? ["issue", "document"] : ["issue", "document", "comment"], commentsMayClarify: excludedType, waiverAuthorities: [] } });
  expect(result.sources.map(source => source.type)).toEqual(["issue", "document"]);
  expect(result.sources[1].content).toBe("Required behavior");
  expect(result.incompleteReasons).toEqual([]);
});
