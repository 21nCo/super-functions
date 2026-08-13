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
  it('registers the expanded workspace read surface', () => {
    expect(Object.keys(linearProvider.actions)).toEqual(
      expect.arrayContaining([
        'issueRelations.list',
        'comments.list',
        'initiatives.list',
        'documents.list',
        'customers.list',
        'attachments.list',
      ])
    );
  });

  it('issues.list follows cursors and aggregates pages', async () => {
    const context = createContext((body: any) => ({
      team: {
        issues: body.variables.after
          ? {
              nodes: [{ id: 'issue_2', identifier: 'ENG-2' }],
              pageInfo: { hasNextPage: false, endCursor: null },
            }
          : {
              nodes: [{ id: 'issue_1', identifier: 'ENG-1' }],
              pageInfo: { hasNextPage: true, endCursor: 'cursor_1' },
            },
      },
    }));

    const result = await linearProvider.actions['issues.list'].execute(
      { teamId: 'team_1', first: 50, maxPages: 3 },
      context
    );

    expect(result.nodes).toEqual([
      { id: 'issue_1', identifier: 'ENG-1' },
      { id: 'issue_2', identifier: 'ENG-2' },
    ]);
    expect(context.http.post).toHaveBeenCalledTimes(2);
    expect((context.http.post as any).mock.calls[0][1].variables).toEqual({
      teamId: 'team_1',
      first: 50,
      after: null,
    });
    expect((context.http.post as any).mock.calls[1][1].variables.after).toBe('cursor_1');
  });

  it.each([
    ['issueRelations.list', 'issueRelations'],
    ['comments.list', 'comments'],
  ])('%s reads and returns its connection', async (actionName, field) => {
    const context = createContext((body: any) => {
      expect(body.query).toContain(`${field}(`);
      if (actionName === 'issueRelations.list') {
        expect(body.query).not.toContain('includeArchived');
        expect(body.variables).toEqual({ first: 25, after: null });
      }
      return {
        [field]: {
          nodes: [{ id: `${field}_1` }],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      };
    });

    const result = await linearProvider.actions[actionName].execute(
      { first: 25, maxPages: 1, includeArchived: false },
      context
    );

    expect(result).toEqual({
      nodes: [{ id: `${field}_1` }],
      pageInfo: { hasNextPage: false, endCursor: null },
    });
  });

  it.each([
    ['initiatives.list', 'initiatives'],
    ['documents.list', 'documents'],
    ['customers.list', 'customers'],
    ['attachments.list', 'attachments'],
  ])('%s reads its workspace connection through the shared paginator', async (actionName, field) => {
    const context = createContext((body: any) => {
      expect(body.query).toContain(`${field}(`);
      expect(body.variables).toEqual({
        first: 25,
        after: null,
        includeArchived: false,
      });
      return {
        [field]: {
          nodes: [{ id: `${field}_1` }],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      };
    });

    const result = await linearProvider.actions[actionName].execute(
      { first: 25, maxPages: 1, includeArchived: false },
      context
    );

    expect(result).toEqual({
      nodes: [{ id: `${field}_1` }],
      pageInfo: { hasNextPage: false, endCursor: null },
    });
  });

  it('customers.list requests and validates the needs connection shape', async () => {
    const context = createContext((body: any) => {
      expect(body.query).toContain('needs{nodes{');
      return {
        customers: {
          nodes: [
            {
              id: 'customer_1',
              name: 'Acme',
              domains: ['acme.test'],
              url: 'https://linear.app/customer/acme',
              needs: { nodes: [{ id: 'need_1', body: 'SSO' }] },
            },
          ],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      };
    });

    const result = await linearProvider.actions['customers.list'].execute(
      { first: 25, maxPages: 1 },
      context
    );

    expect(() => linearProvider.actions['customers.list'].returns.parse(result)).not.toThrow();
  });

  it('leaves shared-paginator quota charging to the executor HTTP wrapper', async () => {
    const context = createContext((body: any) => ({
      initiatives: body.variables.after
        ? { nodes: [{ id: 'initiative_2' }], pageInfo: { hasNextPage: false, endCursor: null } }
        : { nodes: [{ id: 'initiative_1' }], pageInfo: { hasNextPage: true, endCursor: 'next' } },
    }));
    context.acquireRateLimit = vi.fn(async () => undefined);

    await linearProvider.actions['initiatives.list'].execute(
      { first: 25, maxPages: 2 },
      context
    );

    expect(context.http.post).toHaveBeenCalledTimes(2);
    expect(context.acquireRateLimit).not.toHaveBeenCalled();
  });

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
