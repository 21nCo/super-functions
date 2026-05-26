import { describe, expect, it, vi } from 'vitest';
import type { ActionContext } from 'plugfn';
import { githubProvider } from '../../src/github/index.js';

function createContext(responseFactory: (url: string, method: string, data?: any) => any): ActionContext {
  return {
    userId: 'user-1',
    provider: {
      name: 'github',
      baseUrl: 'https://api.github.com',
    },
    auth: {
      type: 'oauth2',
      credentials: {},
    },
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    http: {
      get: vi.fn(async (url: string) => ({
        data: responseFactory(url, 'get'),
        status: 200,
        statusText: 'OK',
        headers: {},
      })),
      post: vi.fn(async (url: string, data: any) => ({
        data: responseFactory(url, 'post', data),
        status: 200,
        statusText: 'OK',
        headers: {},
      })),
      put: vi.fn(),
      patch: vi.fn(async (url: string, data: any) => ({
        data: responseFactory(url, 'patch', data),
        status: 200,
        statusText: 'OK',
        headers: {},
      })),
      delete: vi.fn(),
    },
  };
}

describe('github provider actions', () => {
  it('issues.get fetches a single issue', async () => {
    const context = createContext((url) => {
      expect(url).toContain('/repos/21nCo/super-functions/issues/42');
      return {
        id: 1,
        number: 42,
        title: 'Issue',
        body: 'Body',
        state: 'open',
        html_url: 'https://github.com/21nCo/super-functions/issues/42',
      };
    });

    const result = await githubProvider.actions['issues.get'].execute(
      { owner: '21nCo', repo: 'super-functions', issueNumber: 42 },
      context
    );

    expect(result.number).toBe(42);
  });

  it('issues.update patches issue fields', async () => {
    const context = createContext((url, method, data) => {
      expect(method).toBe('patch');
      expect(url).toContain('/repos/21nCo/super-functions/issues/42');
      expect(data.state).toBe('closed');
      return {
        id: 1,
        number: 42,
        title: data.title ?? 'Issue',
        body: data.body ?? null,
        state: data.state ?? 'open',
        html_url: 'https://github.com/21nCo/super-functions/issues/42',
        updated_at: '2026-03-18T00:00:00Z',
      };
    });

    const result = await githubProvider.actions['issues.update'].execute(
      { owner: '21nCo', repo: 'super-functions', issueNumber: 42, state: 'closed' },
      context
    );

    expect(result.state).toBe('closed');
  });

  it('pulls.create and pulls.createReview execute with public schemas', async () => {
    const context = createContext((url, method, data) => {
      if (method === 'post' && url.endsWith('/pulls')) {
        return {
          id: 2,
          number: 7,
          title: data.title,
          state: 'open',
          html_url: 'https://github.com/21nCo/super-functions/pull/7',
          draft: false,
        };
      }
      if (method === 'post' && url.includes('/pulls/7/reviews')) {
        expect(data.event).toBe('COMMENT');
        return {
          id: 3,
          body: data.body,
          state: 'COMMENTED',
          html_url: 'https://github.com/21nCo/super-functions/pull/7#pullrequestreview-3',
        };
      }
      throw new Error(`Unexpected call: ${method} ${url}`);
    });

    const pr = await githubProvider.actions['pulls.create'].execute(
      {
        owner: '21nCo',
        repo: 'super-functions',
        title: 'Conduct phase 1',
        head: 'feat/conduct-phase-1',
        base: 'next',
      },
      context
    );
    expect(pr.number).toBe(7);

    const review = await githubProvider.actions['pulls.createReview'].execute(
      {
        owner: '21nCo',
        repo: 'super-functions',
        pullNumber: 7,
        body: 'Audit summary',
        event: 'COMMENT',
      },
      context
    );
    expect(review.state).toBe('COMMENTED');
  });
});
