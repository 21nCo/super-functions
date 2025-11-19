import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import {
  LinearClient,
  linearRequest,
  getTeams,
  searchIssues,
  getIssue,
  createComment,
  createIssue,
} from '../../src/api';
import type { LinearClientConfig } from '../../src/api';

const server = setupServer();

beforeAll(() => server.listen());
afterAll(() => server.close());
beforeEach(() => server.resetHandlers());

const mockConfig: LinearClientConfig = {
  apiKey: 'lin_api_test_key_123',
};

describe('LinearClient', () => {
  describe('request method', () => {
    it('should make successful GraphQL request', async () => {
      server.use(
        http.post('https://api.linear.app/graphql', async ({ request }) => {
          const body = await request.json() as any;
          
          return HttpResponse.json({
            data: { viewer: { name: 'Test User' } },
          });
        })
      );

      const client = new LinearClient(mockConfig);
      const result = await client.request('{ viewer { name } }');

      expect(result).toEqual({ viewer: { name: 'Test User' } });
    });

    it('should include API key in Authorization header', async () => {
      let receivedHeaders: Headers | null = null;

      server.use(
        http.post('https://api.linear.app/graphql', ({ request }) => {
          receivedHeaders = request.headers;
          return HttpResponse.json({ data: {} });
        })
      );

      const client = new LinearClient(mockConfig);
      await client.request('{ viewer { name } }');

      expect(receivedHeaders?.get('Authorization')).toBe('lin_api_test_key_123');
      expect(receivedHeaders?.get('Content-Type')).toBe('application/json');
    });

    it('should handle GraphQL errors', async () => {
      server.use(
        http.post('https://api.linear.app/graphql', () => {
          return HttpResponse.json({
            errors: [{ message: 'Invalid field' }],
          });
        })
      );

      const client = new LinearClient(mockConfig);

      await expect(
        client.request('{ invalidField }')
      ).rejects.toThrow('Linear GraphQL error: Invalid field');
    });

    it('should handle HTTP 401 unauthorized', async () => {
      server.use(
        http.post('https://api.linear.app/graphql', () => {
          return new HttpResponse(null, { status: 401 });
        })
      );

      const client = new LinearClient(mockConfig);

      await expect(
        client.request('{ viewer { name } }')
      ).rejects.toThrow('Linear API error: 401');
    });

    it('should handle HTTP 500 server error', async () => {
      server.use(
        http.post('https://api.linear.app/graphql', () => {
          return new HttpResponse(null, { status: 500 });
        })
      );

      const client = new LinearClient(mockConfig);

      await expect(
        client.request('{ viewer { name } }')
      ).rejects.toThrow('Linear API error: 500');
    });

    it('should handle invalid JSON response', async () => {
      server.use(
        http.post('https://api.linear.app/graphql', () => {
          return new HttpResponse('Invalid JSON{', {
            headers: { 'Content-Type': 'application/json' },
          });
        })
      );

      const client = new LinearClient(mockConfig);

      await expect(
        client.request('{ viewer { name } }')
      ).rejects.toThrow();
    });

    it('should handle response with missing data field', async () => {
      server.use(
        http.post('https://api.linear.app/graphql', () => {
          return HttpResponse.json({
            // No data field
          });
        })
      );

      const client = new LinearClient(mockConfig);

      await expect(
        client.request('{ viewer { name } }')
      ).rejects.toThrow('Linear API returned no data');
    });

    it('should handle malformed GraphQL response structure', async () => {
      server.use(
        http.post('https://api.linear.app/graphql', () => {
          return HttpResponse.json({
            data: null,
          });
        })
      );

      const client = new LinearClient(mockConfig);

      await expect(
        client.request('{ viewer { name } }')
      ).rejects.toThrow('Linear API returned no data');
    });

    it('should pass variables correctly', async () => {
      let receivedVariables: any = null;

      server.use(
        http.post('https://api.linear.app/graphql', async ({ request }) => {
          const body = await request.json() as any;
          receivedVariables = body.variables;
          
          return HttpResponse.json({
            data: { issue: { id: body.variables.id } },
          });
        })
      );

      const client = new LinearClient(mockConfig);
      await client.request(
        'query($id: String!) { issue(id: $id) { id } }',
        { id: 'issue-123' }
      );

      expect(receivedVariables).toEqual({ id: 'issue-123' });
    });
  });
});

describe('linearRequest helper', () => {
  it('should make one-off request', async () => {
    server.use(
      http.post('https://api.linear.app/graphql', () => {
        return HttpResponse.json({
          data: { viewer: { name: 'Test User' } },
        });
      })
    );

    const result = await linearRequest('{ viewer { name } }', mockConfig);

    expect(result).toEqual({ viewer: { name: 'Test User' } });
  });
});

describe('getTeams', () => {
  it('should fetch all teams', async () => {
    server.use(
      http.post('https://api.linear.app/graphql', () => {
        return HttpResponse.json({
          data: {
            teams: {
              nodes: [
                { id: 'team1', name: 'Engineering', key: 'ENG' },
                { id: 'team2', name: 'Product', key: 'PROD' },
              ],
            },
          },
        });
      })
    );

    const result = await getTeams(mockConfig);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: 'team1', name: 'Engineering', key: 'ENG' });
    expect(result[1]).toEqual({ id: 'team2', name: 'Product', key: 'PROD' });
  });

  it('should return empty array when no teams', async () => {
    server.use(
      http.post('https://api.linear.app/graphql', () => {
        return HttpResponse.json({
          data: { teams: { nodes: [] } },
        });
      })
    );

    const result = await getTeams(mockConfig);

    expect(result).toEqual([]);
  });
});

describe('searchIssues', () => {
  it('should search issues in a team', async () => {
    server.use(
      http.post('https://api.linear.app/graphql', async ({ request }) => {
        const body = await request.json() as any;
        
        return HttpResponse.json({
          data: {
            issues: {
              nodes: [
                {
                  id: 'issue1',
                  identifier: 'ENG-123',
                  title: 'Bug in login',
                  description: 'Users cannot login',
                  url: 'https://linear.app/team/issue/ENG-123',
                },
              ],
            },
          },
        });
      })
    );

    const result = await searchIssues(mockConfig, 'team1', 'login');

    expect(result).toHaveLength(1);
    expect(result[0].identifier).toBe('ENG-123');
    expect(result[0].title).toBe('Bug in login');
  });

  it('should return empty array when no results', async () => {
    server.use(
      http.post('https://api.linear.app/graphql', () => {
        return HttpResponse.json({
          data: { issues: { nodes: [] } },
        });
      })
    );

    const result = await searchIssues(mockConfig, 'team1', 'nonexistent');

    expect(result).toEqual([]);
  });
});

describe('getIssue', () => {
  it('should fetch issue by identifier', async () => {
    server.use(
      http.post('https://api.linear.app/graphql', () => {
        return HttpResponse.json({
          data: {
            issue: {
              id: 'issue1',
              identifier: 'ENG-123',
              title: 'Test Issue',
              description: 'Issue description',
              url: 'https://linear.app/team/issue/ENG-123',
            },
          },
        });
      })
    );

    const result = await getIssue(mockConfig, 'ENG-123');

    expect(result.identifier).toBe('ENG-123');
    expect(result.title).toBe('Test Issue');
    expect(result.description).toBe('Issue description');
  });

  it('should handle null description', async () => {
    server.use(
      http.post('https://api.linear.app/graphql', () => {
        return HttpResponse.json({
          data: {
            issue: {
              id: 'issue1',
              identifier: 'ENG-456',
              title: 'No Description Issue',
              description: null,
              url: 'https://linear.app/team/issue/ENG-456',
            },
          },
        });
      })
    );

    const result = await getIssue(mockConfig, 'ENG-456');

    expect(result.description).toBeNull();
  });
});

describe('createComment', () => {
  it('should create comment on issue', async () => {
    server.use(
      http.post('https://api.linear.app/graphql', async ({ request }) => {
        const body = await request.json() as any;
        
        return HttpResponse.json({
          data: {
            commentCreate: {
              success: true,
              comment: {
                id: 'comment1',
                body: body.variables.body,
              },
            },
          },
        });
      })
    );

    const result = await createComment(mockConfig, 'issue1', 'Test comment');

    expect(result.success).toBe(true);
    expect(result.comment.body).toBe('Test comment');
  });

  it('should handle comment creation failure', async () => {
    server.use(
      http.post('https://api.linear.app/graphql', () => {
        return HttpResponse.json({
          errors: [{ message: 'Issue not found' }],
        });
      })
    );

    await expect(
      createComment(mockConfig, 'invalid-issue', 'Test comment')
    ).rejects.toThrow('Linear GraphQL error: Issue not found');
  });
});

describe('createIssue', () => {
  it('should create new issue', async () => {
    server.use(
      http.post('https://api.linear.app/graphql', async ({ request }) => {
        const body = await request.json() as any;
        
        return HttpResponse.json({
          data: {
            issueCreate: {
              success: true,
              issue: {
                id: 'new-issue',
                identifier: 'ENG-789',
                title: body.variables.title,
                url: 'https://linear.app/team/issue/ENG-789',
              },
            },
          },
        });
      })
    );

    const result = await createIssue(mockConfig, 'team1', 'New Issue', 'Description');

    expect(result.identifier).toBe('ENG-789');
    expect(result.title).toBe('New Issue');
    expect(result.url).toContain('ENG-789');
  });

  it('should create issue without description', async () => {
    server.use(
      http.post('https://api.linear.app/graphql', async ({ request }) => {
        const body = await request.json() as any;
        
        return HttpResponse.json({
          data: {
            issueCreate: {
              success: true,
              issue: {
                id: 'new-issue',
                identifier: 'ENG-790',
                title: body.variables.title,
                url: 'https://linear.app/team/issue/ENG-790',
              },
            },
          },
        });
      })
    );

    const result = await createIssue(mockConfig, 'team1', 'Title Only');

    expect(result.identifier).toBe('ENG-790');
    expect(result.title).toBe('Title Only');
  });

  it('should handle creation errors', async () => {
    server.use(
      http.post('https://api.linear.app/graphql', () => {
        return HttpResponse.json({
          errors: [{ message: 'Team not found' }],
        });
      })
    );

    await expect(
      createIssue(mockConfig, 'invalid-team', 'Title')
    ).rejects.toThrow('Linear GraphQL error: Team not found');
  });
});
