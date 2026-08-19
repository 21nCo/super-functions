import { z } from 'zod';
import type { Provider } from 'plugfn';
import { AuthType } from 'plugfn';
import { TriggerType } from 'plugfn';
import type { ActionContext } from 'plugfn';
import type { WebhookVerificationContext } from 'plugfn';
import { verifyRawBodyHmac } from '../shared/signature.js';

/**
 * Linear provider
 */
export const linearProvider: Provider = {
  name: 'linear',
  displayName: 'Linear',
  version: '1.0.0',
  description: 'Integration with Linear for issue tracking and project management',
  iconUrl: 'https://linear.app/favicon.ico',
  baseUrl: 'https://api.linear.app/graphql',

  auth: {
    type: 'oauth2' as AuthType.OAuth2,
    config: {
      authorizationUrl: 'https://linear.app/oauth/authorize',
      tokenUrl: 'https://api.linear.app/oauth/token',
      scopes: ['read', 'write'],
      scopeSeparator: ',',
    },
  },

  actions: {
    // Create issue
    'issues.create': {
      name: 'issues.create',
      displayName: 'Create Issue',
      description: 'Create a new issue in Linear',

      parameters: z.object({
        teamId: z.string().describe('Team ID'),
        title: z.string().describe('Issue title'),
        description: z.string().optional().describe('Issue description'),
        priority: z.number().optional().describe('Priority (0-4)'),
        labels: z.array(z.string()).optional().describe('Label IDs'),
        assigneeId: z.string().optional().describe('Assignee user ID'),
        externalId: z.string().optional().describe('External ID for syncing'),
      }),

      returns: z.object({
        success: z.boolean(),
        issue: z.object({
          id: z.string(),
          title: z.string(),
          identifier: z.string(),
          url: z.string(),
          createdAt: z.string(),
        }),
      }),

      execute: async (params: any, context: ActionContext) => {
        const mutation = `
          mutation IssueCreate($input: IssueCreateInput!) {
            issueCreate(input: $input) {
              success
              issue {
                id
                title
                identifier
                url
                createdAt
              }
            }
          }
        `;

        const response = await context.http.post(context.provider.baseUrl, {
          query: mutation,
          variables: {
            input: {
              teamId: params.teamId,
              title: params.title,
              description: params.description,
              priority: params.priority,
              labelIds: params.labels,
              assigneeId: params.assigneeId,
              externalId: params.externalId,
            },
          },
        });

        return response.data.data.issueCreate;
      },
    },

    // List issues
    'issues.list': {
      name: 'issues.list',
      displayName: 'List Issues',
      description: 'List issues for a team',
      idempotent: true,

      parameters: z.object({
        teamId: z.string().describe('Team ID'),
        first: z.number().int().min(1).max(250).optional().default(250).describe('Issues per page'),
        maxPages: z.number().int().min(1).max(100).optional().default(100).describe('Maximum pages to fetch'),
      }),

      returns: z.object({
        nodes: z.array(
          z.object({
            id: z.string(),
            title: z.string(),
            description: z.string().nullable(),
            identifier: z.string(),
            url: z.string(),
            priority: z.number(),
            estimate: z.number().nullable().optional(),
            createdAt: z.string(),
            updatedAt: z.string(),
            dueDate: z.string().nullable().optional(),
            completedAt: z.string().nullable().optional(),
            canceledAt: z.string().nullable().optional(),
            state: z.object({
              id: z.string(),
              name: z.string(),
              type: z.string(),
              color: z.string(),
            }),
            assignee: z
              .object({
                id: z.string(),
                name: z.string(),
                email: z.string(),
              })
              .nullable(),
            creator: z.object({ id: z.string(), name: z.string(), email: z.string() }).nullable(),
            labels: z.object({ nodes: z.array(z.object({ id: z.string(), name: z.string(), color: z.string() })) }),
            cycle: z.object({ id: z.string(), name: z.string().nullable(), number: z.number(), startsAt: z.string(), endsAt: z.string() }).nullable(),
            project: z.object({ id: z.string(), name: z.string() }).nullable(),
            parent: z.object({ id: z.string(), identifier: z.string() }).nullable(),
          })
        ),
        pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() }),
      }),

      execute: async (params: any, context: ActionContext) => {
        const query = `
          query Issues($teamId: String!, $first: Int!, $after: String) {
            team(id: $teamId) {
              issues(first: $first, after: $after) {
                nodes {
                  id
                  title
                  description
                  identifier
                  url
                  priority
                  estimate
                  createdAt
                  updatedAt
                  dueDate
                  completedAt
                  canceledAt
                  state {
                    id
                    name
                    type
                    color
                  }
                  assignee {
                    id
                    name
                    email
                  }
                  creator { id name email }
                  labels { nodes { id name color } }
                  cycle { id name number startsAt endsAt }
                  project { id name }
                  parent { id identifier }
                }
                pageInfo { hasNextPage endCursor }
              }
            }
          }
        `;
        const nodes: any[] = [];
        let after: string | null = null;
        let pageInfo = { hasNextPage: false, endCursor: null as string | null };
        for (let page = 0; page < (params.maxPages ?? 100); page += 1) {
          const response = await context.http.post(context.provider.baseUrl, {
            query,
            variables: {
              teamId: params.teamId,
              first: params.first ?? 250,
              after,
            },
          });
          const connection = response.data.data?.team?.issues;
          if (!connection) throw new Error('The requested team could not be read');
          nodes.push(...(connection.nodes ?? []));
          pageInfo = connection.pageInfo ?? { hasNextPage: false, endCursor: null };
          if (!pageInfo.hasNextPage || !pageInfo.endCursor) break;
          after = pageInfo.endCursor;
        }
        return { nodes, pageInfo };
      },
    },

    'issueRelations.list': {
      name: 'issueRelations.list',
      displayName: 'List Issue Relations',
      description: 'List directional relationships between issues',
      idempotent: true,

      parameters: z.object({
        first: z.number().int().min(1).max(250).optional().default(250).describe('Relations per page'),
        maxPages: z.number().int().min(1).max(100).optional().default(100).describe('Maximum pages to fetch'),
      }),

      returns: z.object({
        nodes: z.array(z.object({
          id: z.string(),
          type: z.string(),
          createdAt: z.string(),
          updatedAt: z.string(),
          issue: z.object({ id: z.string(), identifier: z.string() }),
          relatedIssue: z.object({ id: z.string(), identifier: z.string() }),
        })),
        pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() }),
      }),

      execute: async (params: any, context: ActionContext) => {
        const query = `
          query IssueRelations($first: Int!, $after: String) {
            issueRelations(first: $first, after: $after) {
              nodes {
                id
                type
                createdAt
                updatedAt
                issue { id identifier }
                relatedIssue { id identifier }
              }
              pageInfo { hasNextPage endCursor }
            }
          }
        `;
        const nodes: any[] = [];
        let after: string | null = null;
        let pageInfo = { hasNextPage: false, endCursor: null as string | null };
        for (let page = 0; page < (params.maxPages ?? 100); page += 1) {
          const response = await context.http.post(context.provider.baseUrl, {
            query,
            variables: {
              first: params.first ?? 250,
              after,
            },
          });
          const connection = response.data.data?.issueRelations;
          if (!connection) throw new Error('Issue relations could not be read');
          nodes.push(...(connection.nodes ?? []));
          pageInfo = connection.pageInfo ?? { hasNextPage: false, endCursor: null };
          if (!pageInfo.hasNextPage || !pageInfo.endCursor) break;
          after = pageInfo.endCursor;
        }
        return { nodes, pageInfo };
      },
    },

    // Update issue
    'issues.update': {
      name: 'issues.update',
      displayName: 'Update Issue',
      description: 'Update an existing issue',

      parameters: z.object({
        issueId: z.string().describe('Issue ID'),
        title: z.string().optional().describe('New title'),
        description: z.string().optional().describe('New description'),
        priority: z.number().optional().describe('New priority'),
        stateId: z.string().optional().describe('New state ID'),
      }),

      returns: z.object({
        success: z.boolean(),
        issue: z.object({
          id: z.string(),
          title: z.string(),
          identifier: z.string(),
        }),
      }),

      execute: async (params: any, context: ActionContext) => {
        const mutation = `
          mutation IssueUpdate($id: String!, $input: IssueUpdateInput!) {
            issueUpdate(id: $id, input: $input) {
              success
              issue {
                id
                title
                identifier
              }
            }
          }
        `;

        const response = await context.http.post(context.provider.baseUrl, {
          query: mutation,
          variables: {
            id: params.issueId,
            input: {
              title: params.title,
              description: params.description,
              priority: params.priority,
              stateId: params.stateId,
            },
          },
        });

        return response.data.data.issueUpdate;
      },
    },

    // Get issue
    'issues.get': {
      name: 'issues.get',
      displayName: 'Get Issue',
      description: 'Get a single issue by ID',
      idempotent: true,

      parameters: z.object({
        issueId: z.string().describe('Issue ID'),
      }),

      returns: z.object({
        id: z.string(),
        title: z.string(),
        identifier: z.string(),
        description: z.string().nullable(),
        url: z.string(),
        state: z
          .object({
            id: z.string(),
            name: z.string(),
          })
          .nullable(),
      }),

      execute: async (params: any, context: ActionContext) => {
        const query = `
          query Issue($issueId: String!) {
            issue(id: $issueId) {
              id
              title
              identifier
              description
              url
              state {
                id
                name
              }
            }
          }
        `;

        const response = await context.http.post(context.provider.baseUrl, {
          query,
          variables: {
            issueId: params.issueId,
          },
        });

        return response.data.data.issue;
      },
    },

    // Create comment
    'comments.create': {
      name: 'comments.create',
      displayName: 'Create Comment',
      description: 'Create a comment on a Linear issue',

      parameters: z.object({
        issueId: z.string().describe('Issue ID'),
        body: z.string().describe('Comment body'),
      }),

      returns: z.object({
        success: z.boolean(),
        comment: z.object({
          id: z.string(),
          body: z.string(),
          createdAt: z.string(),
        }),
      }),

      execute: async (params: any, context: ActionContext) => {
        const mutation = `
          mutation CommentCreate($input: CommentCreateInput!) {
            commentCreate(input: $input) {
              success
              comment {
                id
                body
                createdAt
              }
            }
          }
        `;

        const response = await context.http.post(context.provider.baseUrl, {
          query: mutation,
          variables: {
            input: {
              issueId: params.issueId,
              body: params.body,
            },
          },
        });

        return response.data.data.commentCreate;
      },
    },

    // List comments available to the connected workspace
    'comments.list': {
      name: 'comments.list',
      displayName: 'List Comments',
      description: 'List workspace comments with issue and author metadata',
      idempotent: true,

      parameters: z.object({
        first: z.number().int().min(1).max(250).optional().default(250),
        maxPages: z.number().int().min(1).max(100).optional().default(100),
        includeArchived: z.boolean().optional().default(true),
      }),

      returns: z.object({
        nodes: z.array(z.object({
          id: z.string(),
          body: z.string(),
          url: z.string(),
          createdAt: z.string(),
          updatedAt: z.string(),
          issue: z.object({ id: z.string() }).nullable(),
          parent: z.object({ id: z.string() }).nullable(),
          user: z.object({ id: z.string(), name: z.string(), email: z.string() }).nullable(),
          botActor: z.object({ id: z.string(), name: z.string(), userDisplayName: z.string().nullable().optional() }).nullable(),
        })),
        pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() }),
      }),

      execute: async (params: any, context: ActionContext) => {
        const query = `
          query Comments($first: Int!, $after: String, $includeArchived: Boolean!) {
            comments(first: $first, after: $after, includeArchived: $includeArchived, orderBy: createdAt) {
              nodes {
                id
                body
                url
                createdAt
                updatedAt
                issue { id }
                parent { id }
                user { id name email }
                botActor { id name userDisplayName }
              }
              pageInfo { hasNextPage endCursor }
            }
          }
        `;
        const nodes: any[] = [];
        let after: string | null = null;
        let pageInfo = { hasNextPage: false, endCursor: null as string | null };
        for (let page = 0; page < (params.maxPages ?? 100); page += 1) {
          const response = await context.http.post(context.provider.baseUrl, { query, variables: { first: params.first ?? 250, after, includeArchived: params.includeArchived ?? true } });
          if (Array.isArray(response.data.errors) && response.data.errors.length) throw new Error(response.data.errors[0]?.message ?? 'Comments could not be read');
          const connection = response.data.data?.comments;
          if (!connection) throw new Error('Comments could not be read');
          nodes.push(...(connection.nodes ?? []));
          pageInfo = connection.pageInfo ?? { hasNextPage: false, endCursor: null };
          if (!pageInfo.hasNextPage || !pageInfo.endCursor) break;
          after = pageInfo.endCursor;
        }
        return { nodes, pageInfo };
      },
    },

    // Search issues
    'issues.search': {
      name: 'issues.search',
      displayName: 'Search Issues',
      description: 'Search issues in Linear by query text',
      idempotent: true,

      parameters: z.object({
        teamId: z.string().optional().describe('Optional team ID'),
        query: z.string().describe('Search query'),
        first: z.number().optional().default(20).describe('Number of issues to return'),
      }),

      returns: z.object({
        nodes: z.array(
          z.object({
            id: z.string(),
            identifier: z.string(),
            title: z.string(),
            url: z.string(),
            state: z
              .object({
                name: z.string(),
              })
              .nullable(),
          })
        ),
      }),

      execute: async (params: any, context: ActionContext) => {
        const query = `
          query IssueSearch($query: String!, $first: Int!, $teamId: String) {
            issueSearch(query: $query, first: $first, teamId: $teamId) {
              nodes {
                id
                identifier
                title
                url
                state {
                  name
                }
              }
            }
          }
        `;

        const response = await context.http.post(context.provider.baseUrl, {
          query,
          variables: {
            teamId: params.teamId,
            query: params.query,
            first: params.first ?? 20,
          },
        });

        return response.data.data.issueSearch;
      },
    },

    'initiatives.list': {
      name: 'initiatives.list', displayName: 'List Initiatives', description: 'List workspace initiatives with project relationships',
      idempotent: true,
      parameters: z.object({ first: z.number().int().min(1).max(250).optional().default(250), maxPages: z.number().int().min(1).max(100).optional().default(100), includeArchived: z.boolean().optional().default(true) }),
      returns: z.object({ nodes: z.array(z.object({ id: z.string(), name: z.string(), description: z.string().nullable().optional(), content: z.string().nullable().optional(), status: z.string(), health: z.string().nullable().optional(), targetDate: z.string().nullable().optional(), startedAt: z.string().nullable().optional(), completedAt: z.string().nullable().optional(), url: z.string(), owner: z.object({ id: z.string(), email: z.string().optional() }).nullable().optional(), projects: z.object({ nodes: z.array(z.object({ id: z.string() })) }).optional() }).passthrough()), pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() }) }),
      execute: async (params: any, context: ActionContext) => paginateLinearConnection(context, 'initiatives', `query Initiatives($first:Int!,$after:String,$includeArchived:Boolean!){initiatives(first:$first,after:$after,includeArchived:$includeArchived){nodes{id name description content status health targetDate startedAt completedAt url owner{id email} projects{nodes{id}}} pageInfo{hasNextPage endCursor}}}`, params),
    },

    'documents.list': {
      name: 'documents.list', displayName: 'List Documents', description: 'List workspace documents and their parent relationships',
      idempotent: true,
      parameters: z.object({ first: z.number().int().min(1).max(250).optional().default(250), maxPages: z.number().int().min(1).max(100).optional().default(100), includeArchived: z.boolean().optional().default(true) }),
      returns: z.object({ nodes: z.array(z.object({ id: z.string(), title: z.string(), content: z.string().nullable().optional(), url: z.string(), trashed: z.boolean().optional(), project: z.object({ id: z.string() }).nullable().optional(), initiative: z.object({ id: z.string() }).nullable().optional(), creator: z.object({ id: z.string(), email: z.string().optional() }).nullable().optional() }).passthrough()), pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() }) }),
      execute: async (params: any, context: ActionContext) => paginateLinearConnection(context, 'documents', `query Documents($first:Int!,$after:String,$includeArchived:Boolean!){documents(first:$first,after:$after,includeArchived:$includeArchived){nodes{id title content url trashed project{id} initiative{id} creator{id email}} pageInfo{hasNextPage endCursor}}}`, params),
    },

    'customers.list': {
      name: 'customers.list', displayName: 'List Customers', description: 'List workspace customers and their product needs',
      idempotent: true,
      parameters: z.object({ first: z.number().int().min(1).max(250).optional().default(250), maxPages: z.number().int().min(1).max(100).optional().default(100), includeArchived: z.boolean().optional().default(true) }),
      returns: z.object({ nodes: z.array(z.object({ id: z.string(), name: z.string(), domains: z.array(z.string()), revenue: z.number().nullable().optional(), logoUrl: z.string().nullable().optional(), url: z.string(), tier: z.object({ id: z.string(), name: z.string().optional() }).nullable().optional(), owner: z.object({ id: z.string(), email: z.string().optional() }).nullable().optional(), needs: z.object({ nodes: z.array(z.object({ id: z.string(), body: z.string().nullable().optional(), content: z.string().nullable().optional(), url: z.string().nullable().optional(), priority: z.number().optional(), issue: z.object({ id: z.string() }).nullable().optional(), project: z.object({ id: z.string() }).nullable().optional() }).passthrough()) }).optional() }).passthrough()), pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() }) }),
      execute: async (params: any, context: ActionContext) => paginateLinearConnection(context, 'customers', `query Customers($first:Int!,$after:String,$includeArchived:Boolean!){customers(first:$first,after:$after,includeArchived:$includeArchived){nodes{id name domains revenue logoUrl url tier{id name} owner{id email} needs{nodes{id body content url priority issue{id} project{id}}}} pageInfo{hasNextPage endCursor}}}`, params),
    },

    'attachments.list': {
      name: 'attachments.list', displayName: 'List Attachments', description: 'List external issue attachments with source metadata',
      idempotent: true,
      parameters: z.object({ first: z.number().int().min(1).max(250).optional().default(250), maxPages: z.number().int().min(1).max(100).optional().default(100), includeArchived: z.boolean().optional().default(true) }),
      returns: z.object({ nodes: z.array(z.object({ id: z.string(), title: z.string(), subtitle: z.string().nullable().optional(), url: z.string(), sourceType: z.string().optional(), metadata: z.unknown().optional(), issue: z.object({ id: z.string() }).nullable().optional() }).passthrough()), pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() }) }),
      execute: async (params: any, context: ActionContext) => paginateLinearConnection(context, 'attachments', `query Attachments($first:Int!,$after:String,$includeArchived:Boolean!){attachments(first:$first,after:$after,includeArchived:$includeArchived){nodes{id title subtitle url sourceType metadata issue{id}} pageInfo{hasNextPage endCursor}}}`, params),
    },

    // List teams
    'teams.list': {
      name: 'teams.list',
      displayName: 'List Teams',
      description: 'List all teams in the workspace',
      idempotent: true,

      parameters: z.object({
        first: z.number().optional().describe('Number of teams to return'),
      }),

      returns: z.object({
        nodes: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            key: z.string(),
          })
        ),
      }),

      execute: async (params: any, context: ActionContext) => {
        const query = `
          query Teams($first: Int) {
            teams(first: $first) {
              nodes {
                id
                name
                key
              }
            }
          }
        `;

        const response = await context.http.post(context.provider.baseUrl, {
          query,
          variables: {
            first: params.first || 50,
          },
        });

        return response.data.data.teams;
      },
    },
  },

  triggers: {
    'issue.created': {
      name: 'issue.created',
      displayName: 'Issue Created',
      description: 'Triggered when an issue is created',
      type: TriggerType.Webhook,

      webhookConfig: {
        path: '/webhooks/linear/issue',
        method: 'POST',
        verifySignature: async (payload, signature, secret, context) => {
          return verifyLinearSignature(payload, signature, secret, context);
        },
      },

      schema: z.object({
        action: z.literal('create'),
        data: z.object({
          id: z.string(),
          title: z.string(),
          identifier: z.string(),
          url: z.string(),
        }),
      }),

      handler: async (payload) => {
        return {
          event: 'issue.created',
          data: payload.data,
        };
      },
    },
    'issue.updated': {
      name: 'issue.updated',
      displayName: 'Issue Updated',
      description: 'Triggered when an issue is updated',
      type: TriggerType.Webhook,

      webhookConfig: {
        path: '/webhooks/linear/issue-updated',
        method: 'POST',
        verifySignature: async (payload, signature, secret, context) => {
          return verifyLinearSignature(payload, signature, secret, context);
        },
      },

      schema: z.object({
        action: z.literal('update'),
        data: z.object({
          id: z.string(),
          title: z.string().optional(),
          identifier: z.string().optional(),
        }),
      }),

      handler: async (payload) => {
        return {
          event: 'issue.updated',
          data: payload.data,
        };
      },
    },
    'issue_comment.created': {
      name: 'issue_comment.created',
      displayName: 'Issue Comment Created',
      description: 'Triggered when an issue comment is created',
      type: TriggerType.Webhook,

      webhookConfig: {
        path: '/webhooks/linear/issue-comment',
        method: 'POST',
        verifySignature: async (payload, signature, secret, context) => {
          return verifyLinearSignature(payload, signature, secret, context);
        },
      },

      schema: z.object({
        action: z.literal('create'),
        data: z.object({
          id: z.string(),
          body: z.string(),
          issue: z
            .object({
              id: z.string(),
              identifier: z.string().optional(),
            })
            .optional(),
        }),
      }),

      handler: async (payload) => {
        return {
          event: 'issue_comment.created',
          data: payload.data,
        };
      },
    },
  },

  rateLimit: {
    requests: 1000,
    window: 60000, // 1 minute
  },

  headers: {
    'Content-Type': 'application/json',
  },
};

function verifyLinearSignature(
  _payload: any,
  signature: string,
  secret: string,
  context: WebhookVerificationContext
): boolean {
  return verifyRawBodyHmac({ signature, secret, context, algorithm: 'sha256' });
}

async function paginateLinearConnection(context: ActionContext, field: string, query: string, params: any) {
  const nodes: any[] = [];
  let after: string | null = null;
  let pageInfo = { hasNextPage: false, endCursor: null as string | null };
  for (let page = 0; page < (params.maxPages ?? 100); page += 1) {
    const response = await context.http.post(context.provider.baseUrl, { query, variables: { first: params.first ?? 250, after, includeArchived: params.includeArchived ?? true } });
    if (Array.isArray(response.data.errors) && response.data.errors.length) throw new Error(response.data.errors[0]?.message ?? `${field} could not be read`);
    const connection = response.data.data?.[field];
    if (!connection) throw new Error(`${field} could not be read`);
    nodes.push(...(connection.nodes ?? []));
    pageInfo = connection.pageInfo ?? { hasNextPage: false, endCursor: null };
    if (!pageInfo.hasNextPage || !pageInfo.endCursor) break;
    after = pageInfo.endCursor;
  }
  return { nodes, pageInfo };
}
