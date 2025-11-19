import { z } from 'zod';

/**
 * GitHub issue schema
 */
export const GitHubIssueSchema = z.object({
  id: z.number(),
  number: z.number(),
  title: z.string(),
  body: z.string().nullable(),
  state: z.enum(['open', 'closed']),
  html_url: z.string(),
  user: z.object({
    login: z.string(),
    avatar_url: z.string(),
  }),
  created_at: z.string(),
  updated_at: z.string(),
});

/**
 * GitHub repository schema
 */
export const GitHubRepositorySchema = z.object({
  id: z.number(),
  name: z.string(),
  full_name: z.string(),
  private: z.boolean(),
  html_url: z.string(),
  description: z.string().nullable(),
  owner: z.object({
    login: z.string(),
    avatar_url: z.string(),
  }),
});

/**
 * GitHub types
 */
export type GitHubIssue = z.infer<typeof GitHubIssueSchema>;
export type GitHubRepository = z.infer<typeof GitHubRepositorySchema>;

/**
 * Environment variables for GitHub integration
 */
export interface GitHubBotEnv {
  GITHUB_APP_ID: string;
  GITHUB_INSTALLATION_ID: string;
  GITHUB_PRIVATE_KEY: string;
}

/**
 * Command schemas
 */
export const LinkCommandOptionsSchema = z.object({
  repository: z.string().min(1, 'Repository is required'),
  search: z.string().min(1, 'Search query is required'),
});

export const CreateCommandOptionsSchema = z.object({
  repository: z.string().min(1, 'Repository is required'),
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
});

export type LinkCommandOptions = z.infer<typeof LinkCommandOptionsSchema>;
export type CreateCommandOptions = z.infer<typeof CreateCommandOptionsSchema>;
