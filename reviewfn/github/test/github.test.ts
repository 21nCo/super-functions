import { describe, expect, it } from "vitest";
import type { ReviewReport } from "@superfunctions/reviewfn-core";
import { githubRepositoryIdentity, GitHubAdvisoryPublisher, GitHubApi, GitSourceControlAdapter } from "../src/index.js";

function report(repository = "repo"): ReviewReport {
  return { schemaVersion: 1, runId: "run1", attemptId: "attempt", createdAt: "2026-01-01T00:00:00Z", change: { repositoryId: `https://github.com/acme/${repository}`, host: "github.com", pullRequest: 1, targetBranch: "main", baseCommit: "a".repeat(40), headCommit: "b".repeat(40), mergeBaseCommit: "a".repeat(40), diffDigest: "d".repeat(64), changedPaths: [], capturedAt: "2026-01-01T00:00:00Z" }, contextManifestDigest: "c".repeat(64), contextManifestArtifact: `context-manifest-${"c".repeat(64)}`, configuration: { schemaVersion: 1, policyDigest: "p", promptDigest: "q", harness: { id: "codex", version: "1" }, inference: { provider: "openai", model: "model", auth: "api-key" }, execution: { adapter: "isolated", timeoutMs: 1, maxOutputBytes: 1 }, contextAdapters: [], profile: "requirements" }, execution: "completed", coverage: "complete", coverageReasons: [], verdict: "ready", requirements: [], assessments: [], evidence: [], findings: [], tests: [], inspectedPaths: [], uninspected: [], limitations: [] };
}

describe("GitSourceControlAdapter", () => {
  it("captures immutable base/head/merge-base and full diff", async () => {
    const calls: string[][] = [];
    const runner = async (args: string[]) => {
      calls.push(args);
      if (args[0] === "rev-parse" && args[1] === "--verify") return args.at(-1)!.startsWith("base") ? "a".repeat(40) : "b".repeat(40);
      if (args[0] === "config") return "https://github.com/acme/repo.git";
      if (args[0] === "rev-parse" && args[1] === "HEAD") return "b".repeat(40);
      if (args[0] === "merge-base") return "a".repeat(40);
      if (args[0] === "diff" && args.includes("--name-only")) return "src/a.ts\0src/b.ts\0";
      if (args[0] === "diff") return "patch";
      if (args[0] === "rev-parse") return "main";
      return "";
    };
    const snapshot = await new GitSourceControlAdapter({ runner }).capture(".", "base", "head", 7);
    expect(snapshot.changedPaths).toEqual(["src/a.ts", "src/b.ts"]);
    expect(snapshot.host).toBe("github.com");
    expect(calls.some((args) => args.includes("--binary") && args.includes("--full-index"))).toBe(true);
  });
  it("rejects escaping code anchors", async () => expect(await new GitSourceControlAdapter({ runner: async () => "" }).verifyAnchor(".", { commit: "a".repeat(40), path: "../secret" })).toBe(false));
});

describe("GitHubAdvisoryPublisher", () => {
  it("maintains one summary and one check for repeated delivery", async () => {
    let comment: { id: number; body: string; user: { login: string } } | undefined;
    let check: { id: number; external_id: string } | undefined;
    const calls: Array<{ method: string; url: string }> = [];
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input); const method = init?.method ?? "GET"; calls.push({ method, url });
      const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
      if (url.includes("/pulls/1")) return json({ head: { sha: "b".repeat(40) } });
      if (url.includes("/issues/1/comments") && method === "GET") return json(comment ? [comment] : []);
      if (url.includes("/issues/1/comments") && method === "POST") { comment = { id: 9, user: { login: "github-actions[bot]" }, body: JSON.parse(String(init?.body)).body }; return json(comment, 201); }
      if (url.includes("/issues/comments/9") && method === "PATCH") { comment = { id: 9, user: { login: "github-actions[bot]" }, body: JSON.parse(String(init?.body)).body }; return json(comment); }
      if (url.includes("/commits/") && url.includes("/check-runs")) return json({ check_runs: check ? [check] : [] });
      if (url.endsWith("/check-runs") && method === "POST") { check = { id: 4, external_id: JSON.parse(String(init?.body)).external_id }; return json(check, 201); }
      if (url.endsWith("/check-runs/4") && method === "PATCH") return json(check);
      return json({ error: "unexpected" }, 500);
    };
    const publisher = new GitHubAdvisoryPublisher({ api: new GitHubApi({ owner: "acme", repository: "repo", token: "secret", fetch: fetcher }), pullRequest: 1 });
    const request = { report: report(), rendered: "report", expectedHead: "b".repeat(40), profile: "requirements" };
    expect((await publisher.publish(request)).status).toBe("published");
    expect((await publisher.publish(request)).status).toBe("unchanged");
    expect(calls.filter((call) => call.method === "POST" && call.url.includes("/issues/1/comments"))).toHaveLength(1);
    expect(calls.filter((call) => call.method === "POST" && call.url.endsWith("/check-runs"))).toHaveLength(1);
  });
  it("refuses stale publication before reading comments", async () => {
    const fetcher: typeof fetch = async () => new Response(JSON.stringify({ head: { sha: "c".repeat(40) } }), { status: 200 });
    const publisher = new GitHubAdvisoryPublisher({ api: new GitHubApi({ owner: "acme", repository: "repo", token: "secret", fetch: fetcher }), pullRequest: 1 });
    expect((await publisher.publish({ report: report(), rendered: "x", expectedHead: "b".repeat(40), profile: "requirements" })).status).toBe("stale");
  });
});
it("does not write when the PR advances during comment listing", async () => {
  let head = "b".repeat(40); let writes = 0;
  const fetcher: typeof fetch = async (input, init) => {
    if (init?.method !== "GET") writes++;
    if (String(input).includes("/pulls/")) return Response.json({ head: { sha: head } });
    head = "c".repeat(40); return Response.json([]);
  };
  const publisher = new GitHubAdvisoryPublisher({ api: new GitHubApi({ owner: "acme", repository: "race", token: "secret", fetch: fetcher }), pullRequest: 1 });
  expect((await publisher.publish({ report: report("race"), rendered: "report", expectedHead: "b".repeat(40), profile: "requirements" })).status).toBe("stale"); expect(writes).toBe(0);
});
it("serializes concurrent delivery and ignores marker spoofing by another author", async () => {
  const comments: Array<{ id: number; body: string; user: { login: string } }> = [{ id: 1, body: "<!-- reviewfn:requirements -->", user: { login: "untrusted" } }]; let creates = 0;
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input); const method = init?.method;
    if (url.includes("/pulls/")) return Response.json({ head: { sha: "b".repeat(40) } });
    if (url.includes("/comments") && method === "GET") return Response.json(comments);
    if (url.includes("/comments") && method === "POST") { creates++; const comment = { id: 2, body: JSON.parse(String(init?.body)).body, user: { login: "github-actions[bot]" } }; comments.push(comment); return Response.json(comment); }
    if (method === "GET") return Response.json({ check_runs: [] });
    return Response.json({ id: 3 });
  };
  const options = { api: new GitHubApi({ owner: "acme", repository: "concurrent", token: "secret", fetch: fetcher }), pullRequest: 1 };
  const request = { report: report("concurrent"), rendered: "report", expectedHead: "b".repeat(40), profile: "requirements" };
  const results = await Promise.all([new GitHubAdvisoryPublisher(options).publish(request), new GitHubAdvisoryPublisher(options).publish(request)]);
  expect(results.map(result => result.status)).toEqual(["published", "unchanged"]); expect(creates).toBe(1); expect(comments[0].body).toBe("<!-- reviewfn:requirements -->");
});

it("rejects cleartext and credential-bearing API origins", () => {
  for (const baseUrl of ["http://api.example.invalid", "https://user:password@api.example.invalid", "https://api.example.invalid?token=secret"]) expect(() => new GitHubApi({ owner: "acme", repository: "repo", token: "secret", baseUrl })).toThrow(/HTTPS/);
});
it("propagates unexpected Git identity failures", async () => {
  const adapter = new GitSourceControlAdapter({ runner: async args => { if (args[0] === "config") throw Object.assign(new Error("permission denied"), { code: 128 }); return "b".repeat(40); } });
  await expect(adapter.capture(".", "base", "head")).rejects.toThrow(/permission denied/);
});

it.each(["https://api.github.com?", "https://api.github.com#"])("rejects ambiguous API base %s", baseUrl => {
  expect(() => new GitHubApi({ owner: "a", repository: "b", token: "fixture", baseUrl })).toThrow(/URL/);
});

it("compares publication repository identity across GitHub remote formats", () => {
  expect(githubRepositoryIdentity("https://github.com/Acme/repo.git")).toBe("acme/repo");
  expect(githubRepositoryIdentity("git@github.com:acme/repo.git")).toBe("acme/repo");
  expect(githubRepositoryIdentity("ssh://git@github.com/acme/repo.git")).toBe("acme/repo");
  expect(githubRepositoryIdentity("https://github.com/fork/repo.git")).not.toBe("acme/repo");
  expect(githubRepositoryIdentity("https://other.example/acme/repo.git")).toBeUndefined();
});

it.each(["file://github.com/acme/repo", "ftp://github.com/acme/repo", "https://github.com:444/acme/repo"])("rejects noncanonical publication transport %s", remote => expect(githubRepositoryIdentity(remote)).toBeUndefined());
it("normalizes uppercase SCP hosts", () => expect(githubRepositoryIdentity("git@GITHUB.COM:Acme/repo.git")).toBe("acme/repo"));

it.each(["private-user@github.com:acme/repo.git", "ssh://private-user@github.com/acme/repo.git"])("redacts usernames and retains host identity for %s", async remote => {
  const runner = async (args: string[]) => {
    if (args[0] === "config") return remote;
    if (args[0] === "status" || args[0] === "diff") return "";
    if (args.includes("--symbolic-full-name")) return "refs/heads/main";
    return args[0] === "merge-base" || args.at(-1) === "base^{commit}" ? "a".repeat(40) : "b".repeat(40);
  };
  const change = await new GitSourceControlAdapter({ runner }).capture(".", "base", "head");
  expect(change.host).toBe("github.com");
  expect(JSON.stringify(change)).not.toContain("private-user"); expect(githubRepositoryIdentity(change.repositoryId)).toBe("acme/repo");
});

it("classifies drive-relative Windows origins as local", async () => {
  const runner = async (args: string[]) => {
    if (args[0] === "config") return "C:repo";
    if (args[0] === "status" || args[0] === "diff") return "";
    if (args.includes("--symbolic-full-name")) return "refs/heads/main";
    return args[0] === "merge-base" || args.at(-1) === "base^{commit}" ? "a".repeat(40) : "b".repeat(40);
  };
  const change = await new GitSourceControlAdapter({ runner }).capture(".", "base", "head");
  expect(change.repositoryId).toBe("C:repo"); expect(change.host).toBe("local");
});

it.each(["tree", "commit", "blob"])("requires a blob for code anchors (%s)", async type => {
  const adapter = new GitSourceControlAdapter({ runner: async args => args[0] === "cat-file" ? type : "implementation" });
  expect(await adapter.verifyAnchor(".", { commit: "a".repeat(40), path: "src", startLine: 1, symbol: "implementation" })).toBe(type === "blob");
});

it.each(["head", "pull-request", "repository"])("rejects mismatched report publication identity (%s)", async mismatch => {
  let calls = 0;
  const api = new GitHubApi({ owner: "acme", repository: "repo", token: "fixture", fetch: async (input, init) => { calls++; const url = String(input); return Response.json(url.includes("/pulls/") ? { head: { sha: "b".repeat(40) } } : url.includes("check-runs") ? { check_runs: [] } : init?.method === "GET" ? [] : { id: 1 }); } });
  const value = report();
  if (mismatch === "head") value.change.headCommit = "c".repeat(40);
  else if (mismatch === "pull-request") value.change.pullRequest = 2;
  else value.change.repositoryId = "https://github.com/other/repo";
  const result = await new GitHubAdvisoryPublisher({ api, pullRequest: 1 }).publish({ report: value, rendered: "report", expectedHead: "b".repeat(40), profile: "requirements" });
  expect(result.status).toBe("failed");
  expect(result.error).toMatch(/identity/);
  expect(calls).toBe(0);
});

it.each(["https://git.example.com/acme/repo.git", "git@git.example.com:acme/repo.git", "https://other.example.com/acme/repo"])("binds Enterprise publication to the configured host (%s)", async remote => {
  let calls = 0;
  const api = new GitHubApi({ owner: "acme", repository: "repo", token: "fixture", baseUrl: "https://git.example.com/api/v3", fetch: async (input, init) => { calls++; const url = String(input); return Response.json(url.includes("/pulls/") ? { head: { sha: "b".repeat(40) } } : url.includes("check-runs") ? { check_runs: [] } : init?.method === "GET" ? [] : { id: 1 }); } });
  const value = report(); value.change.repositoryId = remote; value.change.host = "git.example.com";
  const result = await new GitHubAdvisoryPublisher({ api, pullRequest: 1 }).publish({ report: value, rendered: "report", expectedHead: "b".repeat(40), profile: "requirements" });
  expect(result.status).toBe(remote.includes("other.example") ? "failed" : "published");
  expect(calls > 0).toBe(!remote.includes("other.example"));
});
