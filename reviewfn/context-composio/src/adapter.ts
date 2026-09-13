import { spawn } from "node:child_process";
import { lstat } from "node:fs/promises";
import path from "node:path";
import { homedir } from "node:os";

import { safeRead, resolveTrustedExecutable, sha256, type ContextAdapter, type ContextManifest, type ContextRequest, type ContextSource, type PreflightResult } from "@superfunctions/reviewfn-core";

export interface ComposioCommandResult { code: number | null; stdout: string; stderr: string }
export type ComposioRunner = (args: string[], signal?: AbortSignal) => Promise<ComposioCommandResult>;

const defaultRunner: ComposioRunner = async (args, signal) => {
  const executable = await resolveTrustedExecutable("composio");
  return new Promise((resolve, reject) => {
  if (signal?.aborted) { reject(new Error("Context retrieval canceled.")); return; }
  const env = Object.fromEntries(["PATH", "HOME", "COMPOSIO_API_KEY", "COMPOSIO_CONFIG_DIR"].flatMap(key => process.env[key] ? [[key, process.env[key]]] : []));
  const child = spawn(executable, args, { env, detached: process.platform !== "win32", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  let exceeded = false;
  let bytes = 0;
  const abort = () => { try { process.kill(-child.pid!, "SIGKILL"); } catch { child.kill("SIGKILL"); } };
  const timer = setTimeout(() => { exceeded = true; abort(); }, 30_000);
  const append = (chunk: Buffer, target: "stdout" | "stderr") => { bytes += chunk.length; if (bytes > 5_000_000) { exceeded = true; abort(); return; } if (target === "stdout") stdout += chunk.toString("utf8"); else stderr += chunk.toString("utf8"); };
  signal?.addEventListener("abort", abort, { once: true });
  child.stdout.on("data", (chunk: Buffer) => append(chunk, "stdout"));
  child.stderr.on("data", (chunk: Buffer) => append(chunk, "stderr"));
  const cleanup = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); abort(); };
  if (signal?.aborted) abort();
  child.once("error", error => { cleanup(); reject(error); });
  child.once("exit", abort);
  child.once("close", (code) => { cleanup(); resolve({ code: exceeded || signal?.aborted ? 1 : code, stdout, stderr: exceeded ? "Composio time or output budget exhausted." : stderr }); });
  });
};

export interface ComposioContextOptions { runner?: ComposioRunner }

export class ComposioLinearContextAdapter implements ContextAdapter {
  public readonly id = "composio-linear";
  private readonly runner: ComposioRunner;
  public constructor(options: ComposioContextOptions = {}) { this.runner = options.runner ?? defaultRunner; }

  public async preflight(request: ContextRequest): Promise<PreflightResult> {
    const diagnostics: PreflightResult["diagnostics"] = [];
    if (!request.issue) diagnostics.push({ code: "REVIEWFN_LINEAR_ISSUE_REQUIRED", level: "error", message: "A Linear issue identifier is required." });
    if (!request.account) diagnostics.push({ code: "REVIEWFN_COMPOSIO_ACCOUNT_REQUIRED", level: "error", message: "An explicit Composio connected-account alias or ID is required." });
    if (!request.expectedWorkspace) diagnostics.push({ code: "REVIEWFN_LINEAR_WORKSPACE_REQUIRED", level: "error", message: "expectedWorkspace is required to prevent cross-workspace reads." });
    const version = await this.runner(["--version"], request.signal).catch((error) => ({ code: null, stdout: "", stderr: error instanceof Error ? error.message : String(error) }));
    if (version.code !== 0) diagnostics.push({ code: "REVIEWFN_COMPOSIO_UNAVAILABLE", level: "error", message: `Composio CLI is unavailable: ${version.stderr.trim() || `exit ${String(version.code)}`}.` });
    return { ok: diagnostics.every((item) => item.level !== "error"), resolved: diagnostics.some((item) => item.level === "error") ? undefined : { provider: "composio", model: "none", auth: "connected-account", harnessVersion: version.stdout.trim() || "unknown" }, diagnostics };
  }

  public async fetch(request: ContextRequest): Promise<Omit<ContextManifest, "digest">> {
    if (!request.issue || !request.account || !request.expectedWorkspace) throw new Error("issue, account, and expectedWorkspace are required.");
    const payload = await this.execute("LINEAR_GET_LINEAR_ISSUE", { issue_id: request.issue }, request.account, request.signal);
    const issue = findIssue(payload, request.issue);
    if (!issue) throw new Error(`Composio returned no accessible Linear issue for ${request.issue}.`);
    const workspaceCandidates = collectWorkspaceCandidates(issue);
    if (!workspaceCandidates.some((candidate) => candidate.toLowerCase() === request.expectedWorkspace!.toLowerCase())) {
      throw new Error(`Linear workspace mismatch: expected ${request.expectedWorkspace}; received ${workspaceCandidates.length ? workspaceCandidates.join(", ") : "no workspace identity"}.`);
    }

    const sources: ContextSource[] = [];
    const incompleteReasons: string[] = [];
    let consumed = 0;
    const add = (source: Omit<ContextSource, "digest">) => {
      if (request.sourceAuthority && !request.sourceAuthority.acceptedTypes.includes(source.type)) return true;
      if (sources.length >= request.limits.maxSources) { incompleteReasons.push(`Linear source limit ${request.limits.maxSources} reached.`); return false; }
      const original = source.content ?? "";
      const remaining = request.limits.maxBytes - consumed;
      if (remaining <= 0) { incompleteReasons.push(`Linear byte limit ${request.limits.maxBytes} reached.`); return false; }
      const bytes = Buffer.from(original);
      const content = bytes.length <= remaining ? original : new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes.subarray(0, remaining), { stream: true });
      const status = content === original ? source.status : "truncated";
      sources.push({ ...source, status, content, digest: sha256(content) });
      consumed += Buffer.byteLength(content);
      if (status === "truncated") incompleteReasons.push(`${source.id} was truncated by the context byte limit.`);
      return status !== "truncated";
    };
    const issueId = stringField(issue, "id") ?? request.issue;
    const issueIdentifier = stringField(issue, "identifier") ?? request.issue;
    const account = request.account;
    let connectionRequests = 0;
    const fetchConnection = async (name: "comments" | "documents", after?: string): Promise<unknown> => {
      if (connectionRequests >= request.limits.maxSources) {
        const reason = "Linear connection pagination request budget exhausted.";
        if (!incompleteReasons.includes(reason)) incompleteReasons.push(reason);
        return undefined;
      }
      connectionRequests++;
      return this.fetchIssueConnection(name, issueId, after, account, request.signal);
    };
    add({ id: `linear:issue:${issueId}`, type: "issue", canonicalUrl: stringField(issue, "url"), workspace: request.expectedWorkspace, retrievedAt: new Date().toISOString(), updatedAt: stringField(issue, "updatedAt"), providerVersion: "LINEAR_GET_LINEAR_ISSUE", status: "available", content: JSON.stringify(issueWithoutConnections(issue), null, 2) });

    const comments: Record<string, unknown>[] = [];
    if (!request.sourceAuthority || (request.sourceAuthority.acceptedTypes.includes("comment") && request.sourceAuthority.commentsMayClarify)) {
      let initialComments = issue.comments;
      if (!hasPageInfo(initialComments)) {
        try { initialComments = findConnection(await fetchConnection("comments"), "comments", issueId); }
        catch (error) { if (request.signal?.aborted) throw error; incompleteReasons.push("Unable to establish complete Linear comment pagination."); }
      }
      comments.push(...connectionNodes(initialComments));
      let commentPage = pageInfo(initialComments);
      if (!hasPageInfo(initialComments)) incompleteReasons.push("Linear comment pagination metadata missing.");
      const commentCursors = new Set<string>();
      while (commentPage.hasNextPage && commentPage.endCursor && !commentCursors.has(commentPage.endCursor) && comments.length < request.limits.maxSources) {
        commentCursors.add(commentPage.endCursor);
        const page = await fetchConnection("comments", commentPage.endCursor);
        const connection = findConnection(page, "comments", issueId);
        comments.push(...connectionNodes(connection));
        if (!hasPageInfo(connection)) incompleteReasons.push("Linear comment pagination metadata missing or malformed.");
        commentPage = pageInfo(connection);
      }
      for (const comment of comments) {
        const id = stringField(comment, "id") ?? sha256(JSON.stringify(comment)).slice(0, 16);
        if (!add({ id: `linear:comment:${id}`, type: "comment", workspace: request.expectedWorkspace, retrievedAt: new Date().toISOString(), updatedAt: stringField(comment, "updatedAt"), providerVersion: "LINEAR_GET_LINEAR_ISSUE", status: "available", parentId: `linear:issue:${issueId}`, content: stringField(comment, "body") ?? JSON.stringify(comment, null, 2) })) break;
      }
      if (commentPage.hasNextPage) incompleteReasons.push(`Linear comments for ${issueIdentifier} remain incomplete at cursor ${commentPage.endCursor ?? "unknown"}.`);

    }

    if (!request.sourceAuthority || request.sourceAuthority.acceptedTypes.includes("document")) {
      let issueWorkspace = linearWorkspace(stringField(issue, "url"));
      if (!issueWorkspace && `${JSON.stringify({ ...issue, comments: undefined })}${JSON.stringify(comments)}`.includes("/document/")) {
        try {
          const query = "query($id: String!) { issue(id: $id) { id identifier title url } }";
          const canonicalIssue = findIssue(await this.execute("LINEAR_RUN_QUERY_OR_MUTATION", { query_or_mutation: query, variables: { id: issueId } }, request.account, request.signal), issueId);
          const canonicalUrl = canonicalIssue && stringField(canonicalIssue, "url");
          issueWorkspace = linearWorkspace(canonicalUrl);
          if (issueWorkspace) { const source = sources.find(item => item.id === `linear:issue:${issueId}`); if (source) source.canonicalUrl = canonicalUrl; }
        } catch (error) { if (request.signal?.aborted) throw error; incompleteReasons.push("Unable to verify the canonical issue workspace for linked documents."); }
      }
      const linkedDocuments = (text: string): Record<string, unknown>[] => [...text.matchAll(/https:\/\/linear\.app\/[^\s/)]+\/document\/([a-zA-Z0-9-]+)/g)].flatMap(match => {
        if (!issueWorkspace || linearWorkspace(match[0]) !== issueWorkspace) { incompleteReasons.push("Linked document workspace is unverified or differs from the issue workspace."); return []; }
        return [{ id: match[1].split("-").at(-1)!, url: match[0], linked: true }];
      });
      let initialDocuments = issue.documents;
      if (!hasPageInfo(initialDocuments)) {
        try { initialDocuments = findConnection(await fetchConnection("documents"), "documents", issueId); }
        catch (error) { if (request.signal?.aborted) throw error; incompleteReasons.push("Unable to establish complete Linear document pagination."); }
      }
      if (!hasPageInfo(initialDocuments)) incompleteReasons.push("Linear document pagination metadata missing or malformed.");
      const candidateKeys = new Map<string, Record<string, unknown>>();
      const uniqueDocuments = (candidates: Record<string, unknown>[]) => candidates.filter(document => {
        const key = stringField(document, "url") ?? stringField(document, "id");
        if (!key) return false;
        const existing = candidateKeys.get(key);
        if (existing) { if ((!existing.content && document.content) || (existing.linked === true && document.linked !== true)) Object.assign(existing, document); return false; }
        candidateKeys.set(key, document); return true;
      });
      const documents = uniqueDocuments([...connectionNodes(initialDocuments), ...connectionNodes(issue.documents), ...arrayObjects(issue.documents), ...linkedDocuments(JSON.stringify({ ...issue, comments: undefined })), ...comments.flatMap(comment => linkedDocuments(stringField(comment, "body") ?? ""))]);
      let documentPage = pageInfo(initialDocuments);
      const documentCursors = new Set<string>();
      while (documentPage.hasNextPage && documentPage.endCursor && !documentCursors.has(documentPage.endCursor) && documents.length < request.limits.maxSources) {
        documentCursors.add(documentPage.endCursor);
        const page = await fetchConnection("documents", documentPage.endCursor);
        const connection = findConnection(page, "documents", issueId);
        documents.push(...uniqueDocuments(connectionNodes(connection)));
        if (!hasPageInfo(connection)) incompleteReasons.push("Linear document pagination metadata missing or malformed.");
        documentPage = pageInfo(connection);
      }
      if (documentPage.hasNextPage) incompleteReasons.push(`Linear documents for ${issueIdentifier} remain incomplete at cursor ${documentPage.endCursor ?? "unknown"}.`);
      const seenDocuments = new Set<string>();
      const seenDocumentUrls = new Set<string>();
      const documentDepth = new Map(documents.map(document => [stringField(document, "id")!, 1]));
      for (const summary of documents) {
        if (request.signal?.aborted) throw new Error("Context retrieval canceled.");
        const id = stringField(summary, "id");
        const summaryUrl = stringField(summary, "url");
        if (!id || seenDocuments.has(id) || summaryUrl && seenDocumentUrls.has(summaryUrl)) continue;
        if (sources.length >= request.limits.maxSources || consumed >= request.limits.maxBytes) { incompleteReasons.push("Linear aggregate retrieval budget exhausted."); break; }
        seenDocuments.add(id);
        let document = summary;
        if (!stringField(summary, "content")) {
          try {
            if (summary.linked === true) {
              const metadata = findDocument(await this.fetchDocument(id, request.account, request.signal, false), id, false);
              if (!issueWorkspace || !metadata || linearWorkspace(stringField(metadata, "url")) !== issueWorkspace) { incompleteReasons.push(`Linear document ${id} workspace could not be verified before reading content.`); continue; }
            }
            document = findDocument(await this.fetchDocument(id, request.account, request.signal), id) ?? summary;
          }
          catch (error) {
            if (request.signal?.aborted) throw error;
            add({ id: `linear:document:${id}`, type: "document", canonicalUrl: stringField(summary, "url"), workspace: request.expectedWorkspace, retrievedAt: new Date().toISOString(), status: "failed", parentId: `linear:issue:${issueId}`, error: error instanceof Error ? error.message : String(error) });
            incompleteReasons.push(`Unable to fetch Linear document ${id}.`);
            continue;
          }
        }
        const canonicalUrl = stringField(document, "url");
        if ((summary.linked === true && (!canonicalUrl || !issueWorkspace)) || (canonicalUrl && issueWorkspace && linearWorkspace(canonicalUrl) !== issueWorkspace)) { incompleteReasons.push(`Linear document ${id} workspace could not be verified against the issue.`); continue; }
        if (canonicalUrl && seenDocumentUrls.has(canonicalUrl)) continue;
        if (canonicalUrl) seenDocumentUrls.add(canonicalUrl);
        const content = stringField(document, "content");
        if (!content) {
          add({ id: `linear:document:${id}`, type: "document", canonicalUrl: stringField(document, "url"), workspace: request.expectedWorkspace, retrievedAt: new Date().toISOString(), status: "unsupported", parentId: `linear:issue:${issueId}`, error: "Document content was not returned." });
          incompleteReasons.push(`Linear document ${id} did not include content.`);
        } else {
          for (const linked of linkedDocuments(content)) {
            const linkedId = stringField(linked, "id")!;
            if (seenDocuments.has(linkedId) || documentDepth.has(linkedId) || candidateKeys.has(stringField(linked, "url") ?? linkedId)) continue;
            if ((documentDepth.get(id) ?? 1) >= request.limits.maxDepth) incompleteReasons.push(`Linked document ${linkedId} exceeds depth budget.`);
            else { documentDepth.set(linkedId, (documentDepth.get(id) ?? 1) + 1); documents.push(...uniqueDocuments([linked])); }
          }
          add({ id: `linear:document:${stringField(document, "id") ?? id}`, type: "document", canonicalUrl: stringField(document, "url"), workspace: request.expectedWorkspace, retrievedAt: new Date().toISOString(), updatedAt: stringField(document, "updatedAt"), providerVersion: "LINEAR_RUN_QUERY_OR_MUTATION", status: "available", parentId: `linear:issue:${issueId}`, content });
        }
      }
    }
    return { version: 1, sources, selection: { candidates: [request.issue], selected: sources.filter(source => source.status === "available").map(source => source.id), rule: `explicit issue ${request.issue} using explicit Composio account ${request.account}` }, limits: request.limits, incompleteReasons };
  }

  private async execute(slug: string, data: Record<string, unknown>, account: string, signal?: AbortSignal): Promise<unknown> {
    const result = await this.runner(["execute", slug, "--account", account, "-d", JSON.stringify(data)], signal);
    if (result.code !== 0) throw new Error(`${slug} failed: ${result.stderr.trim() || `exit ${String(result.code)}`}`);
    try {
      let payload = JSON.parse(result.stdout);
      if (payload.storedInFile) {
        const file = typeof payload.storedInFile === "string" ? payload.storedInFile : payload.filePath ?? payload.path;
        if (typeof file !== "string" || !path.resolve(file).startsWith(`${path.join(homedir(), ".composio")}${path.sep}`)) throw new Error("Unsafe Composio stored response path.");
        const resolvedFile = path.resolve(file);
        const stat = await lstat(resolvedFile);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 5_000_000) throw new Error("Composio stored response exceeds bounds or is not a regular file.");
        payload = JSON.parse((await safeRead(resolvedFile, 5_000_000)).toString("utf8"));
      }
      if (records(payload).some(record => record.successful === false || (Array.isArray(record.errors) && record.errors.length))) throw new Error("Composio or Linear returned an error envelope.");
      return payload;
    }
    catch (error) { throw new Error(`${slug} returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`); }
  }

  private fetchDocument(id: string, account: string, signal?: AbortSignal, includeContent = true): Promise<unknown> {
    const query = `query($id: String!) { document(id: $id) { id slugId title ${includeContent ? "content" : ""} url updatedAt } }`;
    return this.execute("LINEAR_RUN_QUERY_OR_MUTATION", { query_or_mutation: query, variables: { id } }, account, signal);
  }

  private fetchIssueConnection(connection: "comments" | "documents", issueId: string, after: string | undefined, account: string, signal?: AbortSignal): Promise<unknown> {
    const fields = connection === "comments" ? "id body createdAt updatedAt parent { id } user { id name }" : "id title content url updatedAt";
    const query = `query($issueId: String!, $after: String) { issue(id: $issueId) { id identifier ${connection}(first: 50, after: $after) { nodes { ${fields} } pageInfo { hasNextPage endCursor } } } }`;
    return this.execute("LINEAR_RUN_QUERY_OR_MUTATION", { query_or_mutation: query, variables: { issueId, after } }, account, signal);
  }
}

function records(value: unknown, output: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (!value || typeof value !== "object") return output;
  if (Array.isArray(value)) { for (const item of value) records(item, output); return output; }
  const record = value as Record<string, unknown>;
  output.push(record);
  for (const item of Object.values(record)) records(item, output);
  return output;
}

function findIssue(value: unknown, expected: string): Record<string, unknown> | undefined {
  return records(value).find(record => typeof record.title === "string" && [record.id, record.identifier].some(identity => typeof identity === "string" && identity.toLowerCase() === expected.toLowerCase()));
}

function findDocument(value: unknown, expected: string, requireContent = true): Record<string, unknown> | undefined {
  return records(value).find(record => typeof record.id === "string" && (record.id === expected || record.slugId === expected) && (!requireContent || typeof record.content === "string") && typeof record.title === "string");
}

function findConnection(value: unknown, name: "comments" | "documents", issueId: string): unknown {
  return records(value).find(record => (record.id === issueId || typeof record.identifier === "string" && record.identifier.toLowerCase() === issueId.toLowerCase()) && record[name] && typeof record[name] === "object")?.[name];
}

function stringField(record: Record<string, unknown>, key: string): string | undefined { return typeof record[key] === "string" ? record[key] as string : undefined; }
function arrayObjects(value: unknown): Record<string, unknown>[] { return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : []; }
function connectionNodes(value: unknown): Record<string, unknown>[] { return value && typeof value === "object" ? arrayObjects((value as Record<string, unknown>).nodes) : []; }
function hasPageInfo(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const info = (value as Record<string, unknown>).pageInfo;
  if (!info || typeof info !== "object") return false;
  const page = info as Record<string, unknown>;
  return typeof page.hasNextPage === "boolean" && (!page.hasNextPage || typeof page.endCursor === "string" && page.endCursor.length > 0);
}
function pageInfo(value: unknown): { hasNextPage: boolean; endCursor?: string } {
  const candidate = value && typeof value === "object" ? (value as Record<string, unknown>).pageInfo : undefined;
  if (!candidate || typeof candidate !== "object") return { hasNextPage: false };
  const info = candidate as Record<string, unknown>;
  return { hasNextPage: info.hasNextPage === true, endCursor: typeof info.endCursor === "string" ? info.endCursor : undefined };
}

function collectWorkspaceCandidates(issue: Record<string, unknown>): string[] {
  const result = new Set<string>();
  for (const record of [issue]) {
    for (const key of ["workspace", "workspaceId", "organization", "organizationId"]) {
      const value = record[key];
      if (typeof value === "string") result.add(value);
      else if (value && typeof value === "object" && !Array.isArray(value)) for (const field of ["id", "key", "name", "slugId"]) { const candidate = (value as Record<string, unknown>)[field]; if (typeof candidate === "string") result.add(candidate); }
    }
  }
  const team = issue.team;
  if (team && typeof team === "object" && !Array.isArray(team)) for (const field of ["id", "key", "name"]) { const candidate = (team as Record<string, unknown>)[field]; if (typeof candidate === "string") result.add(candidate); }
  return [...result];
}

function issueWithoutConnections(issue: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(issue).filter(([key]) => !["comments", "documents", "attachments"].includes(key)));
}

function linearWorkspace(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try { const parsed = new URL(url); return parsed.protocol === "https:" && parsed.hostname === "linear.app" && !parsed.port && !parsed.username && !parsed.password ? parsed.pathname.split("/")[1]?.toLowerCase() || undefined : undefined; } catch { return undefined; }
}
