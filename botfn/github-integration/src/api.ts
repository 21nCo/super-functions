import { getGitHubAppToken } from './auth';

export interface GitHubClientConfig {
  appId: string;
  installationId: string;
  privateKey: string;
}

/**
 * GitHub API client
 */
export class GitHubClient {
  private config: GitHubClientConfig;
  private tokenCache?: { token: string; expiresAt: number };

  constructor(config: GitHubClientConfig) {
    this.config = config;
  }

  /**
   * Get cached or fresh token
   */
  private async getToken(): Promise<string> {
    const now = Date.now() / 1000;
    if (this.tokenCache && this.tokenCache.expiresAt > now + 60) {
      return this.tokenCache.token;
    }

    const token = await getGitHubAppToken(
      this.config.appId,
      this.config.installationId,
      this.config.privateKey
    );

    this.tokenCache = {
      token,
      expiresAt: now + 55 * 60, // Tokens expire after 1 hour, cache for 55 min
    };

    return token;
  }

  /**
   * Make authenticated request to GitHub API
   */
  async request<T = any>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = await this.getToken();
    const url = `https://api.github.com${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'Discord-GitHub-Bot',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    if (response.status === 204) {
      return null as any;
    }

    return response.json() as Promise<T>;
  }
}

/**
 * Simple helper for one-off requests (no caching)
 */
export async function githubRequest<T = any>(
  endpoint: string,
  config: GitHubClientConfig,
  options: RequestInit = {}
): Promise<T> {
  const token = await getGitHubAppToken(
    config.appId,
    config.installationId,
    config.privateKey
  );

  const url = `https://api.github.com${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'Discord-GitHub-Bot',
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`);
  }

  if (response.status === 204) {
    return null as any;
  }

  return response.json() as Promise<T>;
}
