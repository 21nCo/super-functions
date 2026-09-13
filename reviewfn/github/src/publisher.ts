import { type PreflightResult, type PublishRequest, type PublishResult, type ReportPublisher } from "@superfunctions/reviewfn-core";

import { publicationLease } from "./lease.js";
import { GitHubApi } from "./api.js";

interface PullRequestResponse { head: { sha: string } }
interface Comment { id: number; body?: string; user?: { login: string } }
interface CommentPage extends Array<Comment> {}
interface CheckRun { id: number; external_id?: string }
interface CheckRunsResponse { check_runs: CheckRun[] }

export interface GitHubPublisherOptions {
  api: GitHubApi;
  pullRequest: number;
  publisherLogin?: string;
}

export class GitHubAdvisoryPublisher implements ReportPublisher {
  public readonly id = "github";
  public constructor(private readonly options: GitHubPublisherOptions) {}

  public async preflight(): Promise<PreflightResult> {
    return { ok: Number.isInteger(this.options.pullRequest) && this.options.pullRequest > 0, diagnostics: Number.isInteger(this.options.pullRequest) && this.options.pullRequest > 0 ? [] : [{ code: "REVIEWFN_GITHUB_PR_INVALID", level: "error", message: "A positive pull request number is required." }] };
  }

  public async currentHead(): Promise<string> {
    const pull = await this.options.api.request<PullRequestResponse>("GET", this.options.api.endpoint(`/pulls/${this.options.pullRequest}`));
    return pull.head.sha;
  }

  public async publish(request: PublishRequest): Promise<PublishResult> {
    const key = this.options.api.endpoint(`/pulls/${this.options.pullRequest}`);
    const previous = locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>(resolve => { release = resolve; });
    const tail = previous.then(() => next);
    locks.set(key, tail);
    await previous;
    try { const unlock = await publicationLease(`${key}:${request.profile}`); try { return await this.publishSerialized(request); } finally { await unlock(); } }
    finally { release(); if (locks.get(key) === tail) locks.delete(key); }
  }

  private async publishSerialized(request: PublishRequest): Promise<PublishResult> {
    if (request.report.execution !== "completed") return { status: "failed", error: "Only completed assessments may be published." };
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(request.profile)) throw new Error("Unsafe profile.");
    const current = await this.currentHead();
    if (current !== request.expectedHead) return { status: "stale", error: `PR head is ${current}, not reviewed head ${request.expectedHead}.` };
    const marker = `<!-- reviewfn:${request.profile} -->`;
    const runMarker = `<!-- reviewfn-run:${request.report.runId} -->`;
    const body = `${marker}\n${runMarker}\n${request.rendered}`;
    if (Buffer.byteLength(body) > 60_000) throw new Error("Report exceeds GitHub comment budget; retain the full local artifact and publish a bounded report.");
    const comments = await this.listComments();
    const existing = comments.find((comment) => comment.user?.login === (this.options.publisherLogin ?? "github-actions[bot]") && comment.body?.startsWith(marker));
    if (await this.currentHead() !== request.expectedHead) return { status: "stale", error: "PR advanced while locating publication." };
    let status: PublishResult["status"];
    let reference: string;
    if (existing?.body?.includes(runMarker)) {
      status = "unchanged";
      reference = `comment:${existing.id}`;
    } else if (existing) {
      await this.options.api.request("PATCH", this.options.api.endpoint(`/issues/comments/${existing.id}`), { body });
      status = "updated";
      reference = `comment:${existing.id}`;
    } else {
      const created = await this.options.api.request<Comment>("POST", this.options.api.endpoint(`/issues/${this.options.pullRequest}/comments`), { body });
      status = "published";
      reference = `comment:${created.id}`;
    }
    if (await this.currentHead() !== request.expectedHead) return { status: "stale", reference, error: "PR advanced during comment publication; the comment retains its reviewed SHA." };
    await this.publishCheck(request);
    return { status, reference };
  }

  private async listComments(): Promise<Comment[]> {
    const comments: Comment[] = [];
    for (let page = 1; page <= 100; page += 1) {
      const batch = await this.options.api.request<CommentPage>("GET", this.options.api.endpoint(`/issues/${this.options.pullRequest}/comments?per_page=100&page=${page}`));
      comments.push(...batch);
      if (batch.length < 100) return comments;
    }
    throw new Error("GitHub comment pagination exceeded 10,000 comments.");
  }

  private async publishCheck(request: PublishRequest): Promise<void> {
    const conclusion = "neutral";
    const externalId = `${request.profile}:${request.report.runId}`;
    const runs: CheckRun[] = [];
    for (let page = 1; page <= 100; page++) {
      const existing = await this.options.api.request<CheckRunsResponse>("GET", this.options.api.endpoint(`/commits/${request.expectedHead}/check-runs?check_name=${encodeURIComponent(`ReviewFn / ${request.profile}`)}&per_page=100&page=${page}`));
      runs.push(...existing.check_runs);
      if (existing.check_runs.length < 100) break;
      if (page === 100) throw new Error("Check pagination budget exhausted.");
    }
    const prior = runs.find((run) => run.external_id === externalId);
    if (await this.currentHead() !== request.expectedHead) throw new Error("PR advanced before check publication.");
    const body = {
      name: `ReviewFn / ${request.profile}`,
      head_sha: request.expectedHead,
      external_id: externalId,
      status: "completed",
      conclusion,
      output: { title: `ReviewFn: ${request.report.verdict ?? "incomplete"}`, summary: request.rendered.slice(0, 65_000) },
    };
    await this.options.api.request(prior ? "PATCH" : "POST", this.options.api.endpoint(prior ? `/check-runs/${prior.id}` : "/check-runs"), body);
  }
}

// Cross-process publishers must use the documented per-repository/PR/profile workflow concurrency group.
const locks = new Map<string, Promise<void>>();
