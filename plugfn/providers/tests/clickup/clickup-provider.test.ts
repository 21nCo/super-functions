import { describe, expect, it, vi } from 'vitest';
import type { ActionContext } from 'plugfn';
import { clickupProvider } from '../../src/clickup/index.js';

function createContext(responseFactory: (url: string, method: string, data?: any) => any): ActionContext {
  return {
    userId: 'user-1',
    provider: {
      name: 'clickup',
      baseUrl: 'https://api.clickup.com/api/v2',
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
      put: vi.fn(async (url: string, data: any) => ({
        data: responseFactory(url, 'put', data),
        status: 200,
        statusText: 'OK',
        headers: {},
      })),
      patch: vi.fn(),
      delete: vi.fn(),
    },
  };
}

describe('clickup provider actions', () => {
  it('tasks.create and tasks.get use expected endpoints', async () => {
    const context = createContext((url, method, data) => {
      if (method === 'post' && url.includes('/list/list_1/task')) {
        expect(data.name).toBe('Task A');
        return { id: 'task_1', name: data.name, status: { status: 'open' } };
      }
      if (method === 'get' && url.includes('/task/task_1')) {
        return { id: 'task_1', name: 'Task A', status: { status: 'open' } };
      }
      throw new Error(`Unexpected ${method} ${url}`);
    });

    const created = await clickupProvider.actions['tasks.create'].execute(
      { listId: 'list_1', name: 'Task A' },
      context
    );
    expect(created.id).toBe('task_1');

    const task = await clickupProvider.actions['tasks.get'].execute({ taskId: 'task_1' }, context);
    expect(task.name).toBe('Task A');
  });

  it('tasks.update and tasks.list and spaces.list return payloads', async () => {
    const context = createContext((url, method, data) => {
      if (method === 'put' && url.includes('/task/task_1')) {
        return { id: 'task_1', name: data.name ?? 'Task A', status: { status: data.status ?? 'open' } };
      }
      if (method === 'get' && url.includes('/list/list_1/task')) {
        return { tasks: [{ id: 'task_1', name: 'Task A', status: { status: 'open' } }] };
      }
      if (method === 'get' && url.includes('/team/team_1/space')) {
        return { spaces: [{ id: 'space_1', name: 'Engineering' }] };
      }
      throw new Error(`Unexpected ${method} ${url}`);
    });

    const updated = await clickupProvider.actions['tasks.update'].execute(
      { taskId: 'task_1', status: 'in progress' },
      context
    );
    expect(updated.status.status).toBe('in progress');

    const listed = await clickupProvider.actions['tasks.list'].execute({ listId: 'list_1' }, context);
    expect(listed.tasks.length).toBe(1);

    const spaces = await clickupProvider.actions['spaces.list'].execute({ teamId: 'team_1' }, context);
    expect(spaces.spaces[0].name).toBe('Engineering');
  });

  it('comments.create posts comment text', async () => {
    const context = createContext((url, method, data) => {
      if (method === 'post' && url.includes('/task/task_1/comment')) {
        return { id: 'comment_1', comment_text: data.comment_text };
      }
      throw new Error(`Unexpected ${method} ${url}`);
    });

    const comment = await clickupProvider.actions['comments.create'].execute(
      { taskId: 'task_1', commentText: 'Phase complete' },
      context
    );
    expect(comment.comment_text).toBe('Phase complete');
  });
});
