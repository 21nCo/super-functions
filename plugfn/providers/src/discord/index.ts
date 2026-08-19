import { z } from 'zod';
import type { Provider } from 'plugfn';
import { AuthType } from 'plugfn';
import type { ActionContext } from 'plugfn';

/**
 * Discord provider
 */
export const discordProvider: Provider = {
  name: 'discord',
  displayName: 'Discord',
  version: '1.0.0',
  description: 'Integration with Discord for messaging and bot interactions',
  iconUrl: 'https://discord.com/assets/favicon.ico',
  baseUrl: 'https://discord.com/api/v10',

  auth: {
    type: 'oauth2' as AuthType.OAuth2,
    config: {
      authorizationUrl: 'https://discord.com/api/oauth2/authorize',
      tokenUrl: 'https://discord.com/api/oauth2/token',
      scopes: ['bot', 'messages.read', 'messages.write'],
      scopeSeparator: ' ',
    },
  },

  actions: {
    // Send message
    'messages.create': {
      name: 'messages.create',
      displayName: 'Send Message',
      description: 'Send a message to a Discord channel',

      parameters: z.object({
        channel_id: z.string().describe('Channel ID'),
        content: z.string().describe('Message content'),
        embeds: z
          .array(
            z.object({
              title: z.string().optional(),
              description: z.string().optional(),
              color: z.number().optional(),
              fields: z
                .array(
                  z.object({
                    name: z.string(),
                    value: z.string(),
                    inline: z.boolean().optional(),
                  })
                )
                .optional(),
            })
          )
          .optional()
          .describe('Message embeds'),
      }),

      returns: z.object({
        id: z.string(),
        channel_id: z.string(),
        content: z.string(),
        timestamp: z.string(),
        author: z.object({
          id: z.string(),
          username: z.string(),
          discriminator: z.string(),
        }),
      }),

      execute: async (params: any, context: ActionContext) => {
        const response = await context.http.post(
          `${context.provider.baseUrl}/channels/${params.channel_id}/messages`,
          {
            content: params.content,
            embeds: params.embeds,
          }
        );

        return response.data;
      },
    },

    // Get channel
    'channels.get': {
      name: 'channels.get',
      displayName: 'Get Channel',
      description: 'Get information about a Discord channel',
      idempotent: true,

      parameters: z.object({
        channel_id: z.string().describe('Channel ID'),
      }),

      returns: z.object({
        id: z.string(),
        type: z.number(),
        name: z.string().optional(),
        topic: z.string().optional().nullable(),
        guild_id: z.string().optional(),
      }),

      execute: async (params: any, context: ActionContext) => {
        const response = await context.http.get(
          `${context.provider.baseUrl}/channels/${params.channel_id}`
        );

        return response.data;
      },
    },

    // List guild channels
    'guilds.channels.list': {
      name: 'guilds.channels.list',
      displayName: 'List Guild Channels',
      description: 'List all channels in a Discord guild',
      idempotent: true,

      parameters: z.object({
        guild_id: z.string().describe('Guild ID'),
      }),

      returns: z.array(
        z.object({
          id: z.string(),
          type: z.number(),
          name: z.string(),
          position: z.number(),
          parent_id: z.string().nullable(),
        })
      ),

      execute: async (params: any, context: ActionContext) => {
        const response = await context.http.get(
          `${context.provider.baseUrl}/guilds/${params.guild_id}/channels`
        );

        return response.data;
      },
    },

    // Create role
    'guilds.roles.create': {
      name: 'guilds.roles.create',
      displayName: 'Create Role',
      description: 'Create a new role in a Discord guild',

      parameters: z.object({
        guild_id: z.string().describe('Guild ID'),
        name: z.string().describe('Role name'),
        color: z.number().optional().describe('Role color'),
        permissions: z.string().optional().describe('Role permissions'),
        mentionable: z.boolean().optional().describe('Is mentionable'),
      }),

      returns: z.object({
        id: z.string(),
        name: z.string(),
        color: z.number(),
        permissions: z.string(),
        position: z.number(),
      }),

      execute: async (params: any, context: ActionContext) => {
        const response = await context.http.post(
          `${context.provider.baseUrl}/guilds/${params.guild_id}/roles`,
          {
            name: params.name,
            color: params.color,
            permissions: params.permissions,
            mentionable: params.mentionable,
          }
        );

        return response.data;
      },
    },
  },

  // Discord message-create events arrive through the Gateway, not an
  // authenticated HTTP webhook. Do not expose an origin-unverifiable route.
  triggers: {},

  rateLimit: {
    requests: 50,
    window: 1000, // 1 second
  },
};
