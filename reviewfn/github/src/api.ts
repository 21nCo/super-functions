export interface GitHubApiOptions { owner: string; repository: string; token: string; baseUrl?: string; fetch?: typeof fetch }

export class GitHubApi {
  private readonly fetcher: typeof fetch;
  private readonly baseUrl: string;
  public constructor(private readonly options: GitHubApiOptions) {
    if (!/^[A-Za-z0-9_.-]+$/.test(options.owner) || !/^[A-Za-z0-9_.-]+$/.test(options.repository)) throw new Error("Invalid GitHub repository identity.");
    const endpoint = new URL(options.baseUrl ?? "https://api.github.com");
    if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || /[?#]/.test(options.baseUrl ?? "")) throw new Error("GitHub API URL must be HTTPS without embedded credentials or query parameters.");
    this.fetcher = options.fetch ?? fetch;
    this.baseUrl = endpoint.toString().replace(/\/$/, "");
  }

  public async request<T>(method: string, endpoint: string, body?: unknown): Promise<T> {
    if (!endpoint.startsWith("/") || endpoint.includes("..")) throw new Error("Unsafe GitHub endpoint.");
    const response = await this.fetcher(`${this.baseUrl}${endpoint}`, {
      method,
      signal: AbortSignal.timeout(30_000),
      headers: { authorization: `Bearer ${this.options.token}`, accept: "application/vnd.github+json", "content-type": "application/json", "user-agent": "reviewfn/0.1", "x-github-api-version": "2022-11-28" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`GitHub API ${method} ${endpoint} failed with ${response.status}.`);
    if (response.status === 204) return undefined as T;
    if (!response.body) throw new Error("GitHub returned no response body.");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.length;
        if (bytes > 5_000_000) throw new Error("GitHub response exceeds byte budget.");
        chunks.push(value);
      }
    } finally { await reader.cancel(); }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
  }

  public endpoint(path: string): string { return `/repos/${this.options.owner}/${this.options.repository}${path}`; }
}
