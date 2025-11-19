import { z } from 'zod';

/**
 * Linear team schema
 */
export const LinearTeamSchema = z.object({
  id: z.string(),
  name: z.string(),
  key: z.string(),
});

/**
 * Linear issue schema
 */
export const LinearIssueSchema = z.object({
  id: z.string(),
  identifier: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  url: z.string(),
});

/**
 * Linear types
 */
export type LinearTeam = z.infer<typeof LinearTeamSchema>;
export type LinearIssue = z.infer<typeof LinearIssueSchema>;

/**
 * Environment variables for Linear integration
 */
export interface LinearBotEnv {
  LINEAR_API_KEY: string;
}

/**
 * Command schemas for Linear
 */
export const LinkLinearCommandOptionsSchema = z.object({
  team: z.string().min(1, 'Team is required'),
  search: z.string().min(1, 'Search query is required'),
});

export const CreateLinearCommandOptionsSchema = z.object({
  team: z.string().min(1, 'Team is required'),
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
});

export type LinkLinearCommandOptions = z.infer<typeof LinkLinearCommandOptionsSchema>;
export type CreateLinearCommandOptions = z.infer<typeof CreateLinearCommandOptionsSchema>;
