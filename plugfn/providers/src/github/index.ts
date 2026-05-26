import { z } from 'zod';
import type { Provider } from 'plugfn';
import { AuthType } from 'plugfn';
import { TriggerType } from 'plugfn';
import type { ActionContext } from 'plugfn';
import type { WebhookVerificationContext } from 'plugfn';
import { verifyRawBodyHmac } from '../shared/signature.js';

/**
 * GitHub provider
 */
export const githubProvider: Provider = {
  name: 'github',
  displayName: 'GitHub',
  version: '1.0.0',
  description: 'Integration with GitHub for managing repositories, issues, and pull requests',
  iconUrl: 'https://github.com/favicon.ico',
  baseUrl: 'https://api.github.com',

  auth: {
    type: 'oauth2' as AuthType.OAuth2,
    config: {
      authorizationUrl: 'https://github.com/login/oauth/authorize',
      tokenUrl: 'https://github.com/login/oauth/access_token',
      scopes: ['repo', 'user', 'read:org'],
      scopeSeparator: ' ',
    },
  },

  actions: {
    // Get repository
    'repos.get': {
      name: 'repos.get',
      displayName: 'Get Repository',
      description: 'Get a repository by owner and name',

      parameters: z.object({
        owner: z.string().describe('Repository owner'),
        repo: z.string().describe('Repository name'),
      }),

      returns: z.object({
        id: z.number(),
        name: z.string(),
        full_name: z.string(),
        description: z.string().nullable(),
        html_url: z.string(),
        clone_url: z.string(),
        default_branch: z.string(),
        stargazers_count: z.number(),
        watchers_count: z.number(),
        forks_count: z.number(),
      }),

      execute: async (params: any, context: ActionContext) => {
        const response = await context.http.get(
          `${context.provider.baseUrl}/repos/${params.owner}/${params.repo}`
        );
        return response.data;
      },
    },

    // List issues
    'issues.list': {
      name: 'issues.list',
      displayName: 'List Issues',
      description: 'List issues for a repository',

      parameters: z.object({
        owner: z.string().describe('Repository owner'),
        repo: z.string().describe('Repository name'),
        state: z.enum(['open', 'closed', 'all']).optional().describe('Issue state'),
        labels: z.array(z.string()).optional().describe('Filter by labels'),
      }),

      returns: z.array(
        z.object({
          id: z.number(),
          number: z.number(),
          title: z.string(),
          body: z.string().nullable(),
          state: z.string(),
          html_url: z.string(),
          user: z.object({
            login: z.string(),
            avatar_url: z.string(),
          }),
          labels: z.array(
            z.object({
              name: z.string(),
              color: z.string(),
            })
          ),
          created_at: z.string(),
          updated_at: z.string(),
        })
      ),

      execute: async (params: any, context: ActionContext) => {
        const queryParams: any = {};
        if (params.state) queryParams.state = params.state;
        if (params.labels) queryParams.labels = params.labels.join(',');

        const response = await context.http.get(
          `${context.provider.baseUrl}/repos/${params.owner}/${params.repo}/issues`,
          { params: queryParams }
        );

        return response.data;
      },
    },

    // Get issue
    'issues.get': {
      name: 'issues.get',
      displayName: 'Get Issue',
      description: 'Get a single issue by number',

      parameters: z.object({
        owner: z.string().describe('Repository owner'),
        repo: z.string().describe('Repository name'),
        issueNumber: z.number().describe('Issue number'),
      }),

      returns: z.object({
        id: z.number(),
        number: z.number(),
        title: z.string(),
        body: z.string().nullable(),
        state: z.enum(['open', 'closed']).or(z.string()),
        html_url: z.string(),
      }),

      execute: async (params: any, context: ActionContext) => {
        const response = await context.http.get(
          `${context.provider.baseUrl}/repos/${params.owner}/${params.repo}/issues/${params.issueNumber}`
        );
        return response.data;
      },
    },

    // Create issue
    'issues.create': {
      name: 'issues.create',
      displayName: 'Create Issue',
      description: 'Create a new issue in a repository',

      parameters: z.object({
        owner: z.string().describe('Repository owner'),
        repo: z.string().describe('Repository name'),
        title: z.string().describe('Issue title'),
        body: z.string().optional().describe('Issue body'),
        labels: z.array(z.string()).optional().describe('Issue labels'),
        assignees: z.array(z.string()).optional().describe('Assignees'),
      }),

      returns: z.object({
        id: z.number(),
        number: z.number(),
        title: z.string(),
        body: z.string().nullable(),
        html_url: z.string(),
        state: z.string(),
        created_at: z.string(),
      }),

      execute: async (params: any, context: ActionContext) => {
        const response = await context.http.post(
          `${context.provider.baseUrl}/repos/${params.owner}/${params.repo}/issues`,
          {
            title: params.title,
            body: params.body,
            labels: params.labels,
            assignees: params.assignees,
          }
        );

        return response.data;
      },
    },

    // Update issue
    'issues.update': {
      name: 'issues.update',
      displayName: 'Update Issue',
      description: 'Update an existing issue in a repository',

      parameters: z.object({
        owner: z.string().describe('Repository owner'),
        repo: z.string().describe('Repository name'),
        issueNumber: z.number().describe('Issue number'),
        title: z.string().optional().describe('New issue title'),
        body: z.string().optional().describe('New issue body'),
        state: z.enum(['open', 'closed']).optional().describe('Issue state'),
        labels: z.array(z.string()).optional().describe('Issue labels'),
        assignees: z.array(z.string()).optional().describe('Issue assignees'),
      }),

      returns: z.object({
        id: z.number(),
        number: z.number(),
        title: z.string(),
        body: z.string().nullable(),
        state: z.enum(['open', 'closed']).or(z.string()),
        html_url: z.string(),
        updated_at: z.string(),
      }),

      execute: async (params: any, context: ActionContext) => {
        const { owner, repo, issueNumber, ...payload } = params;
        const response = await context.http.patch(
          `${context.provider.baseUrl}/repos/${owner}/${repo}/issues/${issueNumber}`,
          payload
        );
        return response.data;
      },
    },

    // Create comment
    'issues.createComment': {
      name: 'issues.createComment',
      displayName: 'Create Issue Comment',
      description: 'Create a comment on an issue',

      parameters: z.object({
        owner: z.string().describe('Repository owner'),
        repo: z.string().describe('Repository name'),
        issueNumber: z.number().describe('Issue number'),
        body: z.string().describe('Comment body'),
      }),

      returns: z.object({
        id: z.number(),
        body: z.string(),
        html_url: z.string(),
        created_at: z.string(),
      }),

      execute: async (params: any, context: ActionContext) => {
        const response = await context.http.post(
          `${context.provider.baseUrl}/repos/${params.owner}/${params.repo}/issues/${params.issueNumber}/comments`,
          { body: params.body }
        );

        return response.data;
      },
    },

    // Create pull request
    'pulls.create': {
      name: 'pulls.create',
      displayName: 'Create Pull Request',
      description: 'Create a pull request in a repository',

      parameters: z.object({
        owner: z.string().describe('Repository owner'),
        repo: z.string().describe('Repository name'),
        title: z.string().describe('Pull request title'),
        body: z.string().optional().describe('Pull request body'),
        head: z.string().describe('Head branch'),
        base: z.string().describe('Base branch'),
        draft: z.boolean().optional().describe('Create as draft'),
      }),

      returns: z.object({
        id: z.number(),
        number: z.number(),
        title: z.string(),
        state: z.string(),
        html_url: z.string(),
        draft: z.boolean().optional(),
      }),

      execute: async (params: any, context: ActionContext) => {
        const response = await context.http.post(
          `${context.provider.baseUrl}/repos/${params.owner}/${params.repo}/pulls`,
          {
            title: params.title,
            body: params.body,
            head: params.head,
            base: params.base,
            draft: params.draft,
          }
        );
        return response.data;
      },
    },

    // Create pull request review
    'pulls.createReview': {
      name: 'pulls.createReview',
      displayName: 'Create Pull Request Review',
      description: 'Create a review on an existing pull request',

      parameters: z.object({
        owner: z.string().describe('Repository owner'),
        repo: z.string().describe('Repository name'),
        pullNumber: z.number().describe('Pull request number'),
        body: z.string().describe('Review body'),
        event: z.enum(['APPROVE', 'REQUEST_CHANGES', 'COMMENT']).describe('Review event type'),
      }),

      returns: z.object({
        id: z.number(),
        body: z.string().nullable(),
        state: z.string(),
        html_url: z.string(),
      }),

      execute: async (params: any, context: ActionContext) => {
        const response = await context.http.post(
          `${context.provider.baseUrl}/repos/${params.owner}/${params.repo}/pulls/${params.pullNumber}/reviews`,
          {
            body: params.body,
            event: params.event,
          }
        );
        return response.data;
      },
    },
  },

  triggers: {
    'issues': {
      name: 'issues',
      displayName: 'Issue Event',
      description: 'Triggered when a GitHub issue is created or updated',
      type: TriggerType.Webhook,

      webhookConfig: {
        path: '/webhooks/github/issues',
        method: 'POST',
        verifySignature: async (payload, signature, secret, context) => {
          return verifyGitHubSignatureRaw(payload, signature, secret, context);
        },
      },

      schema: z.object({
        action: z.string(),
        issue: z.object({
          id: z.number(),
          number: z.number(),
          title: z.string(),
          body: z.string().nullable(),
          html_url: z.string(),
          state: z.string(),
          labels: z.array(z.object({ name: z.string(), color: z.string().optional() })).optional(),
          assignees: z.array(z.object({ login: z.string(), avatar_url: z.string().optional() })).optional(),
          milestone: z.object({ title: z.string(), due_on: z.string().nullable() }).nullable().optional(),
        }),
        repository: z.object({
          id: z.number().optional(),
          name: z.string(),
          full_name: z.string(),
          owner: z.object({
            login: z.string(),
          }),
        }),
      }),

      handler: async (payload) => {
        return {
          event: 'issues',
          data: payload,
        };
      },
    },
    'issues.opened': {
      name: 'issues.opened',
      displayName: 'Issue Opened',
      description: 'Triggered when an issue is opened',
      type: TriggerType.Webhook,

      webhookConfig: {
        path: '/webhooks/github/issues',
        method: 'POST',
        verifySignature: async (payload, signature, secret, context) => {
          return verifyGitHubSignatureRaw(payload, signature, secret, context);
        },
      },

      schema: z.object({
        action: z.literal('opened'),
        issue: z.object({
          id: z.number(),
          number: z.number(),
          title: z.string(),
          body: z.string().nullable(),
          html_url: z.string(),
          user: z.object({
            login: z.string(),
          }),
        }),
        repository: z.object({
          name: z.string(),
          owner: z.object({
            login: z.string(),
          }),
        }),
      }),

      handler: async (payload) => {
        return {
          event: 'issues.opened',
          data: payload,
        };
      },
    },
    'pull_request.closed': {
      name: 'pull_request.closed',
      displayName: 'Pull Request Closed',
      description: 'Triggered when a pull request is closed',
      type: TriggerType.Webhook,

      webhookConfig: {
        path: '/webhooks/github/pull-request',
        method: 'POST',
        verifySignature: async (payload, signature, secret, context) => {
          return verifyGitHubSignatureRaw(payload, signature, secret, context);
        },
      },

      schema: z.object({
        action: z.literal('closed'),
        pull_request: z.object({
          id: z.number(),
          number: z.number(),
          title: z.string(),
          html_url: z.string(),
          merged: z.boolean().optional(),
          state: z.string().optional(),
        }),
        repository: z.object({
          name: z.string(),
          owner: z.object({
            login: z.string(),
          }),
        }),
      }),

      handler: async (payload) => {
        return {
          event: 'pull_request.closed',
          data: payload,
        };
      },
    },
    'issue_comment.created': {
      name: 'issue_comment.created',
      displayName: 'Issue Comment Created',
      description: 'Triggered when an issue comment is created',
      type: TriggerType.Webhook,

      webhookConfig: {
        path: '/webhooks/github/issue-comment',
        method: 'POST',
        verifySignature: async (payload, signature, secret, context) => {
          return verifyGitHubSignatureRaw(payload, signature, secret, context);
        },
      },

      schema: z.object({
        action: z.literal('created'),
        issue: z.object({
          id: z.number(),
          number: z.number(),
          title: z.string(),
          html_url: z.string(),
        }),
        comment: z.object({
          id: z.number(),
          body: z.string(),
          html_url: z.string().optional(),
        }),
        repository: z.object({
          name: z.string(),
          owner: z.object({
            login: z.string(),
          }),
        }),
      }),

      handler: async (payload) => {
        return {
          event: 'issue_comment.created',
          data: payload,
        };
      },
    },
  },

  rateLimit: {
    requests: 5000,
    window: 3600000, // 1 hour
  },
};

function verifyGitHubSignatureRaw(
  _payload: any,
  signature: string,
  secret: string,
  context: WebhookVerificationContext
): boolean {
  return verifyRawBodyHmac({ signature, secret, context, algorithm: 'sha256' });
}
