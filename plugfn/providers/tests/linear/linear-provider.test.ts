import { describe, expect, it, vi } from 'vitest';
import type { ActionContext } from 'plugfn';
import { linearProvider } from '../../src/linear/index.js';

function createContext(responseData: any): ActionContext {
  return {
    userId: 'user-1',
    provider: {
      name: 'linear',
      baseUrl: 'https://api.linear.app/graphql',
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
      get: vi.fn(),
      post: vi.fn(async (_url, body) => {
        return {
          data: {
            data: responseData(body),
          },
          status: 200,
          statusText: 'OK',
          headers: {},
        };
      }),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    },
  };
}

describe('linear provider actions', () => {
  it('issues.get executes query and returns issue payload', async () => {
    const context = createContext(() => ({
      issue: {
        id: 'issue_1',
        title: 'OAuth bug',
        identifier: 'ENG-1234',
        description: 'details',
        url: 'https://linear.app/eng/issue/ENG-1234',
        state: { id: 'state_1', name: 'Backlog' },
      },
    }));

    const action = linearProvider.actions['issues.get'];
    const result = await action.execute({ issueId: 'issue_1' }, context);

    expect(result).toEqual({
      id: 'issue_1',
      title: 'OAuth bug',
      identifier: 'ENG-1234',
      description: 'details',
      url: 'https://linear.app/eng/issue/ENG-1234',
      state: { id: 'state_1', name: 'Backlog' },
    });
    expect((context.http.post as any).mock.calls[0][1].query).toContain('query Issue');
  });

  it('comments.create executes mutation and returns comment payload', async () => {
    const context = createContext(() => ({
      commentCreate: {
        success: true,
        comment: {
          id: 'comment_1',
          body: 'Phase complete',
          createdAt: '2026-03-18T00:00:00Z',
        },
      },
    }));

    const action = linearProvider.actions['comments.create'];
    const result = await action.execute({ issueId: 'issue_1', body: 'Phase complete' }, context);

    expect(result).toEqual({
      success: true,
      comment: {
        id: 'comment_1',
        body: 'Phase complete',
        createdAt: '2026-03-18T00:00:00Z',
      },
    });
    expect((context.http.post as any).mock.calls[0][1].query).toContain('mutation CommentCreate');
  });

  it('issues.search defaults to first=20 and returns nodes', async () => {
    const context = createContext((body: any) => {
      expect(body.variables.first).toBe(20);
      return {
        issueSearch: {
          nodes: [
            {
              id: 'issue_1',
              identifier: 'ENG-1234',
              title: 'OAuth',
              url: 'https://linear.app/eng/issue/ENG-1234',
              state: { name: 'Todo' },
            },
          ],
        },
      };
    });

    const action = linearProvider.actions['issues.search'];
    const result = await action.execute({ query: 'OAuth' }, context);

    expect(result).toEqual({
      nodes: [
        {
          id: 'issue_1',
          identifier: 'ENG-1234',
          title: 'OAuth',
          url: 'https://linear.app/eng/issue/ENG-1234',
          state: { name: 'Todo' },
        },
      ],
    });
    expect((context.http.post as any).mock.calls[0][1].query).toContain('query IssueSearch');
  });
});
