import { describe, expect, it, vi } from 'vitest';
import { linearProvider } from '../src/linear/index.js';

describe('Linear provider', () => {
  it('forwards the declared external ID when creating an issue', async () => {
    const post = vi.fn(async () => ({
      data: {
        data: {
          issueCreate: {
            success: true,
            issue: {
              id: 'issue-1',
              title: 'Synced issue',
              identifier: 'ENG-1',
              url: 'https://linear.app/example/issue/ENG-1',
              createdAt: '2026-08-12T00:00:00.000Z',
            },
          },
        },
      },
    }));

    await linearProvider.actions['issues.create'].execute(
      {
        teamId: 'team-1',
        title: 'Synced issue',
        externalId: 'source-123',
      },
      {
        provider: { name: 'linear', baseUrl: linearProvider.baseUrl },
        http: { post },
      } as any
    );

    expect(post).toHaveBeenCalledWith(
      linearProvider.baseUrl,
      expect.objectContaining({
        variables: {
          input: expect.objectContaining({ externalId: 'source-123' }),
        },
      })
    );
  });
});
