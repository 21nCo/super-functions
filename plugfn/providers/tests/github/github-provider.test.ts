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
  it('registers the expanded repository surface and webhook triggers', () => {
    expect(Object.keys(githubProvider.actions)).toEqual(
      expect.arrayContaining([
        'repos.list',
        'issues.comments.list',
        'pulls.list',
        'releases.list',
        'releases.create',
        'hooks.list',
        'hooks.create',
        'hooks.delete',
        'commits.list',
      ])
    );
    expect(githubProvider.auth.config.scopes).toContain('admin:repo_hook');
    expect(Object.keys(githubProvider.triggers ?? {})).toEqual(
      expect.arrayContaining(['pull_request', 'issue_comment', 'push'])
    );
  });

  it('repos.list paginates and forwards repository filters', async () => {
    let request = 0;
    const context = createContext((url, method) => {
      expect(method).toBe('get');
      expect(url).toBe('https://api.github.com/user/repos');
      request += 1;
      return request === 1
        ? Array.from({ length: 100 }, (_, index) => ({ id: index }))
        : [{ id: 100 }];
    });

    const result = await githubProvider.actions['repos.list'].execute(
      {
        visibility: 'private',
        affiliation: ['owner', 'collaborator'],
        sort: 'pushed',
        direction: 'asc',
        maxPages: 3,
      },
      context
    );

    expect(result).toHaveLength(101);
    expect(context.http.get).toHaveBeenCalledTimes(2);
    expect(context.http.get).toHaveBeenNthCalledWith(1, 'https://api.github.com/user/repos', {
      params: {
        visibility: 'private',
        affiliation: 'owner,collaborator',
        sort: 'pushed',
        direction: 'asc',
        per_page: 100,
        page: 1,
      },
    });
    expect(context.http.get).toHaveBeenNthCalledWith(2, 'https://api.github.com/user/repos', {
      params: expect.objectContaining({ page: 2 }),
    });
  });

  it.each([
    ['issues.comments.list', '/issues/comments'],
    ['pulls.list', '/pulls'],
    ['releases.list', '/releases'],
    ['hooks.list', '/hooks'],
    ['commits.list', '/commits'],
  ])('%s calls its repository collection endpoint', async (actionName, suffix) => {
    const context = createContext((url, method) => {
      expect(method).toBe('get');
      expect(url).toBe(`https://api.github.com/repos/21nCo/super-functions${suffix}`);
      return [{ id: 1 }];
    });

    const result = await githubProvider.actions[actionName].execute(
      { owner: '21nCo', repo: 'super-functions', maxPages: 1 },
      context
    );

    expect(result).toEqual([{ id: 1 }]);
    expect(context.http.get).toHaveBeenCalledTimes(1);
  });

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

  it('creates and deletes repository webhooks with signed JSON configuration', async () => {
    const context = createContext((url, method, data) => {
      expect(method).toBe('post');
      expect(url).toBe('https://api.github.com/repos/21nCo/super-functions/hooks');
      expect(data).toEqual({
        name: 'web',
        active: true,
        events: ['issues', 'push'],
        config: {
          url: 'https://example.com/webhooks/github',
          content_type: 'json',
          secret: 'webhook-secret',
          insecure_ssl: '0',
        },
      });
      return {
        id: 99,
        active: true,
        events: data.events,
        config: data.config,
      };
    });

    const created = await githubProvider.actions['hooks.create'].execute(
      {
        owner: '21nCo',
        repo: 'super-functions',
        url: 'https://example.com/webhooks/github',
        secret: 'webhook-secret',
        events: ['issues', 'push'],
      },
      context
    );
    expect(created.id).toBe(99);

    await expect(
      githubProvider.actions['hooks.delete'].execute(
        { owner: '21nCo', repo: 'super-functions', hookId: 99 },
        context
      )
    ).resolves.toEqual({ deleted: true });
    expect(context.http.delete).toHaveBeenCalledWith(
      'https://api.github.com/repos/21nCo/super-functions/hooks/99'
    );
  });

  it('creates releases with GitHub field names', async () => {
    const context = createContext((url, method, data) => {
      expect(method).toBe('post');
      expect(url).toBe('https://api.github.com/repos/21nCo/super-functions/releases');
      expect(data).toEqual({
        tag_name: 'v1.2.3',
        name: 'Version 1.2.3',
        body: 'Release notes',
        target_commitish: 'next',
        draft: false,
        prerelease: true,
      });
      return { id: 7, tag_name: data.tag_name, prerelease: data.prerelease };
    });

    const result = await githubProvider.actions['releases.create'].execute(
      {
        owner: '21nCo',
        repo: 'super-functions',
        tagName: 'v1.2.3',
        name: 'Version 1.2.3',
        body: 'Release notes',
        targetCommitish: 'next',
        prerelease: true,
      },
      context
    );

    expect(result).toEqual({ id: 7, tag_name: 'v1.2.3', prerelease: true });
  });
});
