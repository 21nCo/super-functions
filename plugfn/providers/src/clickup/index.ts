import { z } from 'zod';
import type { ActionContext } from 'plugfn';
import { AuthType } from 'plugfn';
import type { Provider } from 'plugfn';
import { TriggerType } from 'plugfn';
import type { WebhookVerificationContext } from 'plugfn';
import { verifyRawBodyHmac } from '../shared/signature.js';

export const clickupProvider: Provider = {
  name: 'clickup',
  displayName: 'ClickUp',
  version: '1.0.0',
  description: 'Integration with ClickUp for task and workspace workflows',
  iconUrl: 'https://clickup.com/favicon.ico',
  baseUrl: 'https://api.clickup.com/api/v2',

  auth: {
    type: 'oauth2' as AuthType.OAuth2,
    config: {
      authorizationUrl: 'https://app.clickup.com/api',
      tokenUrl: 'https://api.clickup.com/api/v2/oauth/token',
      scopes: ['tasks:write', 'tasks:read', 'comments:write', 'spaces:read'],
      scopeSeparator: ',',
    },
  },

  actions: {
    'tasks.create': {
      name: 'tasks.create',
      displayName: 'Create Task',
      description: 'Create a task in a ClickUp list',
      parameters: z.object({
        listId: z.string().describe('ClickUp list ID'),
        name: z.string().describe('Task title'),
        description: z.string().optional().describe('Task description'),
        status: z.string().optional().describe('Task status'),
      }),
      returns: z.object({
        id: z.string(),
        name: z.string(),
        status: z.object({
          status: z.string(),
        }),
      }),
      execute: async (params: any, context: ActionContext) => {
        const response = await context.http.post(
          `${context.provider.baseUrl}/list/${params.listId}/task`,
          {
            name: params.name,
            description: params.description,
            status: params.status,
          }
        );
        return response.data;
      },
    },

    'tasks.get': {
      name: 'tasks.get',
      displayName: 'Get Task',
      description: 'Get a task by ID',
      idempotent: true,
      parameters: z.object({
        taskId: z.string().describe('ClickUp task ID'),
      }),
      returns: z.object({
        id: z.string(),
        name: z.string(),
        status: z.object({
          status: z.string(),
        }),
      }),
      execute: async (params: any, context: ActionContext) => {
        const response = await context.http.get(`${context.provider.baseUrl}/task/${params.taskId}`);
        return response.data;
      },
    },

    'tasks.update': {
      name: 'tasks.update',
      displayName: 'Update Task',
      description: 'Update task fields',
      parameters: z.object({
        taskId: z.string().describe('ClickUp task ID'),
        name: z.string().optional().describe('Task title'),
        description: z.string().optional().describe('Task description'),
        status: z.string().optional().describe('Task status'),
      }),
      returns: z.object({
        id: z.string(),
        name: z.string(),
        status: z.object({
          status: z.string(),
        }),
      }),
      execute: async (params: any, context: ActionContext) => {
        const { taskId, ...payload } = params;
        const response = await context.http.put(`${context.provider.baseUrl}/task/${taskId}`, payload);
        return response.data;
      },
    },

    'tasks.list': {
      name: 'tasks.list',
      displayName: 'List Tasks',
      description: 'List tasks in a list',
      idempotent: true,
      parameters: z.object({
        listId: z.string().describe('ClickUp list ID'),
        page: z.number().optional().describe('Page number'),
      }),
      returns: z.object({
        tasks: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            status: z.object({
              status: z.string(),
            }),
          })
        ),
      }),
      execute: async (params: any, context: ActionContext) => {
        const response = await context.http.get(`${context.provider.baseUrl}/list/${params.listId}/task`, {
          params: {
            page: params.page,
          },
        });
        return response.data;
      },
    },

    'comments.create': {
      name: 'comments.create',
      displayName: 'Create Comment',
      description: 'Create a comment on a task',
      parameters: z.object({
        taskId: z.string().describe('ClickUp task ID'),
        commentText: z.string().describe('Comment text'),
      }),
      returns: z.object({
        id: z.string(),
        comment_text: z.string(),
      }),
      execute: async (params: any, context: ActionContext) => {
        const response = await context.http.post(`${context.provider.baseUrl}/task/${params.taskId}/comment`, {
          comment_text: params.commentText,
        });
        return response.data;
      },
    },

    'spaces.list': {
      name: 'spaces.list',
      displayName: 'List Spaces',
      description: 'List spaces in a team',
      idempotent: true,
      parameters: z.object({
        teamId: z.string().describe('ClickUp team ID'),
      }),
      returns: z.object({
        spaces: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
          })
        ),
      }),
      execute: async (params: any, context: ActionContext) => {
        const response = await context.http.get(`${context.provider.baseUrl}/team/${params.teamId}/space`);
        return response.data;
      },
    },
  },

  triggers: {
    'task.updated': {
      name: 'task.updated',
      displayName: 'Task Updated',
      description: 'Triggered when a ClickUp task is updated',
      type: TriggerType.Webhook,
      webhookConfig: {
        path: '/webhooks/clickup/task-updated',
        method: 'POST',
        verifySignature: async (payload, signature, secret, context) => {
          return verifyClickUpSignature(payload, signature, secret, context);
        },
      },
      schema: z.object({
        event: z.literal('taskUpdated'),
        task_id: z.string(),
        history_items: z.array(z.unknown()).optional(),
      }),
      handler: async (payload) => {
        return {
          event: 'task.updated',
          data: payload,
        };
      },
    },
    'task.statusChanged': {
      name: 'task.statusChanged',
      displayName: 'Task Status Changed',
      description: 'Triggered when a ClickUp task status changes',
      type: TriggerType.Webhook,
      webhookConfig: {
        path: '/webhooks/clickup/task-status',
        method: 'POST',
        verifySignature: async (payload, signature, secret, context) => {
          return verifyClickUpSignature(payload, signature, secret, context);
        },
      },
      schema: z.object({
        event: z.literal('taskStatusUpdated'),
        task_id: z.string(),
        status: z.string().optional(),
      }),
      handler: async (payload) => {
        return {
          event: 'task.statusChanged',
          data: payload,
        };
      },
    },
  },
};

function verifyClickUpSignature(
  _payload: any,
  signature: string,
  secret: string,
  context: WebhookVerificationContext
): boolean {
  return verifyRawBodyHmac({ signature, secret, context, algorithm: 'sha256' });
}
