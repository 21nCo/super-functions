import { z } from 'zod';
import type { Provider } from 'plugfn';
import { AuthType } from 'plugfn';
import { TriggerType } from 'plugfn';
import type { ActionContext } from 'plugfn';

/**
 * Slack provider
 */
export const slackProvider: Provider = {
  name: 'slack',
  displayName: 'Slack',
  version: '1.0.0',
  description: 'Integration with Slack for messaging and collaboration',
  iconUrl: 'https://slack.com/favicon.ico',
  baseUrl: 'https://slack.com/api',

  auth: {
    type: 'oauth2' as AuthType.OAuth2,
    config: {
      authorizationUrl: 'https://slack.com/oauth/v2/authorize',
      tokenUrl: 'https://slack.com/api/oauth.v2.access',
      scopes: ['chat:write', 'channels:read', 'users:read'],
      scopeSeparator: ',',
    },
  },

  actions: {
    // Post message
    'chat.postMessage': {
      name: 'chat.postMessage',
      displayName: 'Post Message',
      description: 'Post a message to a Slack channel',

      parameters: z.object({
        channel: z.string().describe('Channel ID or name'),
        text: z.string().describe('Message text'),
        blocks: z
          .array(
            z.object({
              type: z.string(),
              text: z
                .object({
                  type: z.string(),
                  text: z.string(),
                })
                .optional(),
            })
          )
          .optional()
          .describe('Message blocks for rich formatting'),
        thread_ts: z.string().optional().describe('Thread timestamp to reply to'),
        username: z.string().optional().describe('Bot username'),
        icon_emoji: z.string().optional().describe('Bot icon emoji'),
      }),

      returns: z.object({
        ok: z.boolean(),
        channel: z.string(),
        ts: z.string(),
        message: z.object({
          text: z.string(),
          user: z.string(),
          ts: z.string(),
        }),
      }),

      execute: async (params: any, context: ActionContext) => {
        const response = await context.http.post(`${context.provider.baseUrl}/chat.postMessage`, {
          channel: params.channel,
          text: params.text,
          blocks: params.blocks,
          thread_ts: params.thread_ts,
          username: params.username,
          icon_emoji: params.icon_emoji,
        });

        return response.data;
      },
    },

    // List channels
    'conversations.list': {
      name: 'conversations.list',
      displayName: 'List Channels',
      description: 'List all channels in a Slack workspace',

      parameters: z.object({
        types: z.string().optional().describe('Channel types (public_channel, private_channel)'),
        limit: z.number().optional().describe('Max channels to return'),
      }),

      returns: z.object({
        ok: z.boolean(),
        channels: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            is_channel: z.boolean(),
            is_private: z.boolean(),
            is_archived: z.boolean(),
            num_members: z.number().optional(),
          })
        ),
      }),

      execute: async (params: any, context: ActionContext) => {
        const response = await context.http.get(
          `${context.provider.baseUrl}/conversations.list`,
          {
            params: {
              types: params.types,
              limit: params.limit,
            },
          }
        );

        return response.data;
      },
    },

    // Get user info
    'users.info': {
      name: 'users.info',
      displayName: 'Get User Info',
      description: 'Get information about a user',

      parameters: z.object({
        user: z.string().describe('User ID'),
      }),

      returns: z.object({
        ok: z.boolean(),
        user: z.object({
          id: z.string(),
          name: z.string(),
          real_name: z.string(),
          is_bot: z.boolean(),
          profile: z.object({
            email: z.string().optional(),
            image_72: z.string().optional(),
            title: z.string().optional(),
          }),
        }),
      }),

      execute: async (params: any, context: ActionContext) => {
        const response = await context.http.get(`${context.provider.baseUrl}/users.info`, {
          params: { user: params.user },
        });

        return response.data;
      },
    },

    // Create channel
    'conversations.create': {
      name: 'conversations.create',
      displayName: 'Create Channel',
      description: 'Create a new Slack channel',

      parameters: z.object({
        name: z.string().describe('Channel name'),
        is_private: z.boolean().optional().describe('Create private channel'),
      }),

      returns: z.object({
        ok: z.boolean(),
        channel: z.object({
          id: z.string(),
          name: z.string(),
          is_channel: z.boolean(),
          created: z.number(),
        }),
      }),

      execute: async (params: any, context: ActionContext) => {
        const response = await context.http.post(
          `${context.provider.baseUrl}/conversations.create`,
          {
            name: params.name,
            is_private: params.is_private,
          }
        );

        return response.data;
      },
    },
  },

  triggers: {
    'message.channels': {
      name: 'message.channels',
      displayName: 'Message Posted',
      description: 'Triggered when a message is posted in a channel',
      type: TriggerType.Webhook,

      webhookConfig: {
        path: '/webhooks/slack/events',
        method: 'POST',
      },

      schema: z.object({
        type: z.literal('event_callback'),
        event: z.object({
          type: z.literal('message'),
          channel: z.string(),
          user: z.string(),
          text: z.string(),
          ts: z.string(),
        }),
      }),

      handler: async (payload) => {
        return {
          event: 'message.channels',
          data: payload.event,
        };
      },
    },
  },

  rateLimit: {
    requests: 100,
    window: 60000, // 1 minute
  },
};

