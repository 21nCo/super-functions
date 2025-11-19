import { z } from 'zod';

/**
 * Discord interaction option schema
 */
export const DiscordOptionSchema = z.object({
  name: z.string(),
  value: z.union([z.string(), z.number(), z.boolean()]),
  type: z.number().optional(),
  focused: z.boolean().optional(),
});

/**
 * Discord interaction data schema
 */
export const DiscordInteractionDataSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  type: z.number().optional(),
  options: z.array(DiscordOptionSchema).optional(),
});

/**
 * Discord interaction schema
 */
export const DiscordInteractionSchema = z.object({
  id: z.string(),
  application_id: z.string(),
  type: z.number(),
  data: DiscordInteractionDataSchema.optional(),
  guild_id: z.string().optional(),
  channel_id: z.string().optional(),
  member: z.any().optional(),
  user: z.any().optional(),
  token: z.string(),
  version: z.number(),
  message: z.any().optional(),
});

/**
 * Discord interaction types
 */
export type DiscordOption = z.infer<typeof DiscordOptionSchema>;
export type DiscordInteractionData = z.infer<typeof DiscordInteractionDataSchema>;
export type DiscordInteraction = z.infer<typeof DiscordInteractionSchema>;

/**
 * Environment variables for Discord bot
 */
export interface DiscordBotEnv {
  DISCORD_CLIENT_ID: string;
  DISCORD_PUBLIC_KEY: string;
  DISCORD_TOKEN: string;
}
