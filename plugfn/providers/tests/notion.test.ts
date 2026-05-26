import { describe, expect, it, vi } from 'vitest';
import { notionProvider } from '../src/notion/index.js';
import { AuthType } from 'plugfn';

describe('notionProvider', () => {
  it('declares OAuth and core read/write actions', () => {
    expect(notionProvider.name).toBe('notion');
    expect(notionProvider.auth.type).toBe(AuthType.OAuth2);
    expect(Object.keys(notionProvider.actions)).toEqual([
      'users.me',
      'search.query',
      'pages.get',
      'pages.create',
      'pages.update',
      'blocks.children.list',
      'blocks.children.append',
      'databases.retrieve',
      'databases.query',
    ]);
  });

  it('queries databases with Notion API field names', async () => {
    const post = vi.fn(async () => ({ data: { results: [{ id: 'page_1' }] } }));
    const action = notionProvider.actions['databases.query'];

    const result = await action.execute(
      {
        databaseId: 'db_1',
        filter: { property: 'Status', status: { equals: 'Open' } },
        pageSize: 25,
      },
      {
        provider: notionProvider,
        http: { post },
      } as any
    );

    expect(result).toEqual({ results: [{ id: 'page_1' }] });
    expect(post).toHaveBeenCalledWith('https://api.notion.com/v1/databases/db_1/query', {
      filter: { property: 'Status', status: { equals: 'Open' } },
      sorts: undefined,
      page_size: 25,
      start_cursor: undefined,
    });
  });
});
