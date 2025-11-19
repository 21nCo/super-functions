import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { GitHubClient, githubRequest } from '../../src/api';
import type { GitHubClientConfig } from '../../src/api';

// Mock server setup
const server = setupServer();

beforeAll(() => server.listen());
afterAll(() => server.close());
beforeEach(() => {
  server.resetHandlers();
  vi.clearAllMocks();
});

const mockConfig: GitHubClientConfig = {
  appId: '123',
  installationId: '456',
  privateKey: `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA0Z3VS5JJcds3xfn/ygWyF0bJKEswGBRpxhALqd9tBnVzLCt8
-----END RSA PRIVATE KEY-----`,
};

describe('GitHubClient', () => {
  let importKeySpy: any;
  let signSpy: any;

  beforeEach(() => {
    // Mock crypto operations for auth
    importKeySpy = vi.spyOn(crypto.subtle, 'importKey').mockResolvedValue({} as CryptoKey);
    signSpy = vi.spyOn(crypto.subtle, 'sign').mockResolvedValue(new Uint8Array([1, 2, 3, 4]));

    // Mock GitHub App token endpoint
    server.use(
      http.post('https://api.github.com/app/installations/:id/access_tokens', () => {
        return HttpResponse.json({ token: 'ghs_mock_token_123' });
      })
    );
  });

  afterEach(() => {
    // Restore crypto
    importKeySpy.mockRestore();
    signSpy.mockRestore();
  });

  describe('request method', () => {
    it('should make authenticated GET request', async () => {
      server.use(
        http.get('https://api.github.com/repos/owner/repo', () => {
          return HttpResponse.json({
            id: 123,
            name: 'repo',
            full_name: 'owner/repo',
          });
        })
      );

      const client = new GitHubClient(mockConfig);
      const result = await client.request('/repos/owner/repo');

      expect(result).toEqual({
        id: 123,
        name: 'repo',
        full_name: 'owner/repo',
      });
    });

    it('should make authenticated POST request', async () => {
      server.use(
        http.post('https://api.github.com/repos/owner/repo/issues', async ({ request }) => {
          const body = await request.json() as any;
          return HttpResponse.json({
            id: 1,
            number: 42,
            title: body.title,
            state: 'open',
          });
        })
      );

      const client = new GitHubClient(mockConfig);
      const result = await client.request('/repos/owner/repo/issues', {
        method: 'POST',
        body: JSON.stringify({ title: 'Test Issue' }),
      });

      expect(result).toEqual({
        id: 1,
        number: 42,
        title: 'Test Issue',
        state: 'open',
      });
    });

    it('should handle 404 errors', async () => {
      server.use(
        http.get('https://api.github.com/repos/owner/nonexistent', () => {
          return new HttpResponse(null, { status: 404 });
        })
      );

      const client = new GitHubClient(mockConfig);

      await expect(
        client.request('/repos/owner/nonexistent')
      ).rejects.toThrow('GitHub API error: 404');
    });

    it('should handle 401 unauthorized errors', async () => {
      server.use(
        http.get('https://api.github.com/repos/owner/repo', () => {
          return new HttpResponse(null, { status: 401 });
        })
      );

      const client = new GitHubClient(mockConfig);

      await expect(
        client.request('/repos/owner/repo')
      ).rejects.toThrow('GitHub API error: 401');
    });

    it('should handle 403 forbidden errors', async () => {
      server.use(
        http.get('https://api.github.com/repos/owner/repo', () => {
          return new HttpResponse(null, { status: 403 });
        })
      );

      const client = new GitHubClient(mockConfig);

      await expect(
        client.request('/repos/owner/repo')
      ).rejects.toThrow('GitHub API error: 403');
    });

    it('should handle 500 server errors', async () => {
      server.use(
        http.get('https://api.github.com/repos/owner/repo', () => {
          return new HttpResponse(null, { status: 500 });
        })
      );

      const client = new GitHubClient(mockConfig);

      await expect(
        client.request('/repos/owner/repo')
      ).rejects.toThrow('GitHub API error: 500');
    });

    it('should handle 204 no content response', async () => {
      server.use(
        http.delete('https://api.github.com/repos/owner/repo/issues/1', () => {
          return new HttpResponse(null, { status: 204 });
        })
      );

      const client = new GitHubClient(mockConfig);
      const result = await client.request('/repos/owner/repo/issues/1', {
        method: 'DELETE',
      });

      expect(result).toBeNull();
    });

    it('should include correct headers', async () => {
      let receivedHeaders: Headers | null = null;

      server.use(
        http.get('https://api.github.com/user', ({ request }) => {
          receivedHeaders = request.headers;
          return HttpResponse.json({ login: 'testuser' });
        })
      );

      const client = new GitHubClient(mockConfig);
      await client.request('/user');

      expect(receivedHeaders?.get('Authorization')).toMatch(/^token /);
      expect(receivedHeaders?.get('Accept')).toBe('application/vnd.github.v3+json');
      expect(receivedHeaders?.get('User-Agent')).toBe('Discord-GitHub-Bot');
    });

    it('should cache tokens between requests', async () => {
      let tokenRequestCount = 0;

      server.use(
        http.post('https://api.github.com/app/installations/:id/access_tokens', () => {
          tokenRequestCount++;
          return HttpResponse.json({ token: 'ghs_mock_token' });
        }),
        http.get('https://api.github.com/repos/owner/repo', () => {
          return HttpResponse.json({ id: 123 });
        })
      );

      const client = new GitHubClient(mockConfig);

      await client.request('/repos/owner/repo');
      await client.request('/repos/owner/repo');
      await client.request('/repos/owner/repo');

      // Should only request token once due to caching
      expect(tokenRequestCount).toBe(1);
    });
  });
});

describe('githubRequest helper', () => {
  let importKeySpy: any;
  let signSpy: any;

  beforeEach(() => {
    // Mock crypto operations
    importKeySpy = vi.spyOn(crypto.subtle, 'importKey').mockResolvedValue({} as CryptoKey);
    signSpy = vi.spyOn(crypto.subtle, 'sign').mockResolvedValue(new Uint8Array([1, 2, 3, 4]));

    // Mock GitHub App token endpoint
    server.use(
      http.post('https://api.github.com/app/installations/:id/access_tokens', () => {
        return HttpResponse.json({ token: 'ghs_mock_token' });
      })
    );
  });

  afterEach(() => {
    // Restore crypto
    importKeySpy.mockRestore();
    signSpy.mockRestore();
  });

  it('should make one-off request without caching', async () => {
    server.use(
      http.get('https://api.github.com/repos/owner/repo', () => {
        return HttpResponse.json({ id: 123, name: 'repo' });
      })
    );

    const result = await githubRequest('/repos/owner/repo', mockConfig);

    expect(result).toEqual({ id: 123, name: 'repo' });
  });

  it('should handle errors', async () => {
    server.use(
      http.get('https://api.github.com/repos/owner/repo', () => {
        return new HttpResponse(null, { status: 404 });
      })
    );

    await expect(
      githubRequest('/repos/owner/repo', mockConfig)
    ).rejects.toThrow('GitHub API error: 404');
  });
});
