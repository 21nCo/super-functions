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
      if (variables.after === "comments-next") return { code: 0, stderr: "", stdout: JSON.stringify({ data: { issue: { comments: { nodes: [{ id: "c2", body: "second" }], pageInfo: { hasNextPage: false } } } } }) };
      if (variables.after === "documents-next") return { code: 0, stderr: "", stdout: JSON.stringify({ data: { issue: { documents: { nodes: [{ id: "d1", title: "Design", content: "full design" }], pageInfo: { hasNextPage: false } } } } }) };
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
      ? { successful: true, data: { issue: { id: "i", identifier: "ENG-1", title: "Feature", description: "Read https://linear.app/acme/document/design-abcdef123456", team: { name: "workspace-1" }, comments: { nodes: [] } } } }
      : data.query_or_mutation.includes("comments(")
        ? { data: { data: { issue: { comments: { nodes: [{ id: "c", body: "clarification" }], pageInfo: { hasNextPage: false } } } } } }
        : data.query_or_mutation.includes("documents(") ? { data: { data: { issue: { documents: { nodes: [], pageInfo: { hasNextPage: false } } } } } } : { data: { data: { document: { id: "doc", title: "Design", content: "must preserve compatibility" } } } };
    return { code: 0, stdout: JSON.stringify(payload), stderr: "" };
  };
  const result = await new ComposioLinearContextAdapter({ runner }).fetch(request);
  expect(result.sources.map(source => source.type)).toEqual(["issue", "comment", "document"]); expect(result.incompleteReasons).toEqual([]); expect(calls).toHaveLength(4);
});

it("does not accept another workspace identity from nested comment metadata", async () => {
  const runner: ComposioRunner = async () => ({ code: 0, stderr: "", stdout: JSON.stringify({ issue: { id: "i", identifier: "ENG-1", title: "wrong issue", description: "x", organization: { id: "workspace-A" }, comments: { nodes: [{ body: "x", user: { organization: { id: "workspace-1" } } }] } } }) });
  await expect(new ComposioLinearContextAdapter({ runner }).fetch(request)).rejects.toThrow(/workspace mismatch/);
});

it("deduplicates document UUID and URL aliases", async () => {
  const url = "https://linear.app/acme/document/design-abcdef123456";
  const runner: ComposioRunner = async () => ({ code: 0, stderr: "", stdout: JSON.stringify({ issue: { id: "i", identifier: "ENG-1", title: "x", description: url, organization: { id: "workspace-1" }, comments: { nodes: [], pageInfo: { hasNextPage: false } }, documents: { nodes: [{ id: "uuid", title: "Design", url, content: "requirements" }], pageInfo: { hasNextPage: false } } } }) });
  const result = await new ComposioLinearContextAdapter({ runner }).fetch(request);
  expect(result.sources.filter(source => source.type === "document")).toHaveLength(1);
  expect(result.incompleteReasons).toEqual([]);
});

it("does not spend pagination budget on duplicate initial documents", async () => {
  let pages = 0;
  const runner: ComposioRunner = async args => {
    if (args[1] === "LINEAR_GET_LINEAR_ISSUE") return { code: 0, stderr: "", stdout: JSON.stringify({ issue: { id: "i", identifier: "ENG-1", title: "x", description: "requirements", organization: { id: "workspace-1" }, comments: { nodes: [], pageInfo: { hasNextPage: false } }, documents: { nodes: [{ id: "d1", content: "one" }, { id: "d2", content: "two" }], pageInfo: { hasNextPage: true, endCursor: "next" } } } }) };
    pages++; return { code: 0, stderr: "", stdout: JSON.stringify({ issue: { documents: { nodes: [{ id: "d3", content: "three" }], pageInfo: { hasNextPage: false } } } }) };
  };
  const result = await new ComposioLinearContextAdapter({ runner }).fetch({ ...request, limits: { ...request.limits, maxSources: 4 } });
  expect(pages).toBe(1); expect(result.sources.filter(source => source.type === "document")).toHaveLength(3); expect(result.incompleteReasons).toEqual([]);
});

it("rejects a different issue in the same workspace", async () => {
  const runner: ComposioRunner = async () => ({ code: 0, stderr: "", stdout: JSON.stringify({ issue: { id: "other", identifier: "ENG-2", title: "Wrong", organization: { id: "workspace-1" } } }) });
  await expect(new ComposioLinearContextAdapter({ runner }).fetch(request)).rejects.toThrow(/no accessible Linear issue/);
});
