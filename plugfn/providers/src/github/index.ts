import { z } from "zod";
import type { Provider } from "plugfn";
import { AuthType } from "plugfn";
import { TriggerType } from "plugfn";
import type { ActionContext } from "plugfn";
import type { WebhookVerificationContext } from "plugfn";
import { verifyRawBodyHmac } from "../shared/signature.js";

/**
 * GitHub provider
 */
export const githubProvider: Provider = {
  name: "github",
  displayName: "GitHub",
  version: "1.0.0",
  description:
    "Integration with GitHub for managing repositories, issues, and pull requests",
  iconUrl: "https://github.com/favicon.ico",
  baseUrl: "https://api.github.com",

  auth: {
    type: "oauth2" as AuthType.OAuth2,
    config: {
      authorizationUrl: "https://github.com/login/oauth/authorize",
      tokenUrl: "https://github.com/login/oauth/access_token",
      scopes: ["repo", "user", "read:org", "admin:repo_hook"],
      scopeSeparator: " ",
    },
  },

  actions: {
    // List repositories available to the authenticated user
    "repos.list": {
      name: "repos.list",
      displayName: "List Repositories",
      description: "List repositories available to the authenticated user",

      parameters: z.object({
        visibility: z
          .enum(["all", "public", "private"])
          .optional()
          .default("all"),
        affiliation: z
          .array(z.enum(["owner", "collaborator", "organization_member"]))
          .optional(),
        sort: z
          .enum(["created", "updated", "pushed", "full_name"])
          .optional()
          .default("updated"),
        direction: z.enum(["asc", "desc"]).optional().default("desc"),
        maxPages: z.number().int().min(1).max(100).optional().default(100),
      }),

      returns: z.array(
        z
          .object({
            id: z.number(),
            name: z.string(),
            full_name: z.string(),
            private: z.boolean(),
            html_url: z.string(),
            description: z.string().nullable(),
            default_branch: z.string(),
            archived: z.boolean().optional(),
            disabled: z.boolean().optional(),
            pushed_at: z.string().nullable().optional(),
            updated_at: z.string().optional(),
            owner: z.object({
              login: z.string(),
              avatar_url: z.string().optional(),
            }),
            permissions: z
              .object({
                admin: z.boolean(),
                maintain: z.boolean().optional(),
                push: z.boolean(),
                triage: z.boolean().optional(),
                pull: z.boolean(),
              })
              .optional(),
          })
          .passthrough(),
      ),

      execute: async (params: any, context: ActionContext) => {
        const queryParams: Record<string, unknown> = {
          visibility: params.visibility ?? "all",
          sort: params.sort ?? "updated",
          direction: params.direction ?? "desc",
          per_page: 100,
        };
        if (params.affiliation?.length)
          queryParams.affiliation = params.affiliation.join(",");
        const rows: any[] = [];
        for (let page = 1; page <= (params.maxPages ?? 100); page += 1) {
          const response = await context.http.get(
            `${context.provider.baseUrl}/user/repos`,
            {
              params: { ...queryParams, page },
            },
          );
          const pageRows = Array.isArray(response.data) ? response.data : [];
          rows.push(...pageRows);
          if (pageRows.length < 100) break;
        }
        return rows;
      },
    },

    // Get repository
    "repos.get": {
      name: "repos.get",
      displayName: "Get Repository",
      description: "Get a repository by owner and name",

      parameters: z.object({
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
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
          `${context.provider.baseUrl}/repos/${params.owner}/${params.repo}`,
        );
        return response.data;
      },
    },

    // List issues
    "issues.list": {
      name: "issues.list",
      displayName: "List Issues",
      description: "List issues for a repository",

      parameters: z.object({
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        state: z
          .enum(["open", "closed", "all"])
          .optional()
          .describe("Issue state"),
        labels: z.array(z.string()).optional().describe("Filter by labels"),
        maxPages: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .default(100)
          .describe("Maximum 100-item pages to fetch"),
      }),

      returns: z.array(
        z
          .object({
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
              }),
          ),
          created_at: z.string(),
          updated_at: z.string(),
            closed_at: z.string().nullable().optional(),
            comments: z.number().optional(),
            assignees: z
              .array(z.object({ login: z.string(), avatar_url: z.string() }))
              .optional(),
            milestone: z
              .object({
                id: z.number(),
                number: z.number(),
                title: z.string(),
                description: z.string().nullable(),
                due_on: z.string().nullable(),
              })
              .nullable()
              .optional(),
            pull_request: z
              .object({
                url: z.string(),
                html_url: z.string().optional(),
                diff_url: z.string().optional(),
                patch_url: z.string().optional(),
        })
              .optional(),
          })
          .passthrough(),
      ),

      execute: async (params: any, context: ActionContext) => {
        const queryParams: any = {};
        if (params.state) queryParams.state = params.state;
        if (params.labels) queryParams.labels = params.labels.join(",");

        queryParams.per_page = 100;
        const rows: any[] = [];
        for (let page = 1; page <= (params.maxPages ?? 100); page += 1) {
        const response = await context.http.get(
          `${context.provider.baseUrl}/repos/${params.owner}/${params.repo}/issues`,
            { params: { ...queryParams, page } },
        );
          const pageRows = Array.isArray(response.data) ? response.data : [];
          rows.push(...pageRows);
          if (pageRows.length < 100) break;
        }
        return rows;
      },
    },

    // Get issue
    "issues.get": {
      name: "issues.get",
      displayName: "Get Issue",
      description: "Get a single issue by number",

      parameters: z.object({
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        issueNumber: z.number().describe("Issue number"),
      }),

      returns: z.object({
        id: z.number(),
        number: z.number(),
        title: z.string(),
        body: z.string().nullable(),
        state: z.enum(["open", "closed"]).or(z.string()),
        html_url: z.string(),
      }),

      execute: async (params: any, context: ActionContext) => {
        const response = await context.http.get(
          `${context.provider.baseUrl}/repos/${params.owner}/${params.repo}/issues/${params.issueNumber}`,
        );
        return response.data;
      },
    },

    // Create issue
    "issues.create": {
      name: "issues.create",
      displayName: "Create Issue",
      description: "Create a new issue in a repository",

      parameters: z.object({
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        title: z.string().describe("Issue title"),
        body: z.string().optional().describe("Issue body"),
        labels: z.array(z.string()).optional().describe("Issue labels"),
        assignees: z.array(z.string()).optional().describe("Assignees"),
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
          },
        );

        return response.data;
      },
    },

    // Update issue
    "issues.update": {
      name: "issues.update",
      displayName: "Update Issue",
      description: "Update an existing issue in a repository",

      parameters: z.object({
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        issueNumber: z.number().describe("Issue number"),
        title: z.string().optional().describe("New issue title"),
        body: z.string().optional().describe("New issue body"),
        state: z.enum(["open", "closed"]).optional().describe("Issue state"),
        labels: z.array(z.string()).optional().describe("Issue labels"),
        assignees: z.array(z.string()).optional().describe("Issue assignees"),
      }),

      returns: z.object({
        id: z.number(),
        number: z.number(),
        title: z.string(),
        body: z.string().nullable(),
        state: z.enum(["open", "closed"]).or(z.string()),
        html_url: z.string(),
        updated_at: z.string(),
      }),

      execute: async (params: any, context: ActionContext) => {
        const { owner, repo, issueNumber, ...payload } = params;
        const response = await context.http.patch(
          `${context.provider.baseUrl}/repos/${owner}/${repo}/issues/${issueNumber}`,
          payload,
        );
        return response.data;
      },
    },

    // Create comment
    "issues.createComment": {
      name: "issues.createComment",
      displayName: "Create Issue Comment",
      description: "Create a comment on an issue",

      parameters: z.object({
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        issueNumber: z.number().describe("Issue number"),
        body: z.string().describe("Comment body"),
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
          { body: params.body },
        );

        return response.data;
      },
    },

    // List repository issue comments
    "issues.comments.list": {
      name: "issues.comments.list",
      displayName: "List Issue Comments",
      description: "List comments across all issues in a repository",

      parameters: z.object({
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        sort: z.enum(["created", "updated"]).optional().default("created"),
        direction: z.enum(["asc", "desc"]).optional().default("asc"),
        maxPages: z.number().int().min(1).max(100).optional().default(100),
      }),

      returns: z.array(
        z
          .object({
            id: z.number(),
            body: z.string().nullable(),
            html_url: z.string(),
            issue_url: z.string(),
            user: z
              .object({ login: z.string(), avatar_url: z.string().optional() })
              .nullable(),
            created_at: z.string(),
            updated_at: z.string(),
            author_association: z.string().optional(),
          })
          .passthrough(),
      ),

      execute: async (params: any, context: ActionContext) => {
        const rows: any[] = [];
        for (let page = 1; page <= (params.maxPages ?? 100); page += 1) {
          const response = await context.http.get(
            `${context.provider.baseUrl}/repos/${params.owner}/${params.repo}/issues/comments`,
            {
              params: {
                sort: params.sort ?? "created",
                direction: params.direction ?? "asc",
                per_page: 100,
                page,
              },
            },
          );
          const pageRows = Array.isArray(response.data) ? response.data : [];
          rows.push(...pageRows);
          if (pageRows.length < 100) break;
        }
        return rows;
      },
    },

    // List pull requests
    "pulls.list": {
      name: "pulls.list",
      displayName: "List Pull Requests",
      description: "List pull requests for a repository",

      parameters: z.object({
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        state: z.enum(["open", "closed", "all"]).optional().default("all"),
        sort: z
          .enum(["created", "updated", "popularity", "long-running"])
          .optional()
          .default("updated"),
        direction: z.enum(["asc", "desc"]).optional().default("desc"),
        maxPages: z.number().int().min(1).max(100).optional().default(100),
      }),

      returns: z.array(
        z
          .object({
            id: z.number(),
            number: z.number(),
            title: z.string(),
            state: z.string(),
            html_url: z.string(),
            draft: z.boolean().optional(),
            created_at: z.string(),
            updated_at: z.string(),
            closed_at: z.string().nullable(),
            merged_at: z.string().nullable().optional(),
            user: z
              .object({ login: z.string(), avatar_url: z.string().optional() })
              .nullable(),
            head: z.object({
              ref: z.string(),
              sha: z.string(),
              label: z.string().optional(),
            }),
            base: z.object({
              ref: z.string(),
              sha: z.string(),
              label: z.string().optional(),
            }),
            requested_reviewers: z
              .array(z.object({ login: z.string() }))
              .optional(),
            requested_teams: z
              .array(
                z.object({ name: z.string(), slug: z.string().optional() }),
              )
              .optional(),
          })
          .passthrough(),
      ),

      execute: async (params: any, context: ActionContext) => {
        const rows: any[] = [];
        for (let page = 1; page <= (params.maxPages ?? 100); page += 1) {
          const response = await context.http.get(
            `${context.provider.baseUrl}/repos/${params.owner}/${params.repo}/pulls`,
            {
              params: {
                state: params.state ?? "all",
                sort: params.sort ?? "updated",
                direction: params.direction ?? "desc",
                per_page: 100,
                page,
              },
            },
          );
          const pageRows = Array.isArray(response.data) ? response.data : [];
          rows.push(...pageRows);
          if (pageRows.length < 100) break;
        }
        return rows;
      },
    },

    // Create pull request
    "pulls.create": {
      name: "pulls.create",
      displayName: "Create Pull Request",
      description: "Create a pull request in a repository",

      parameters: z.object({
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        title: z.string().describe("Pull request title"),
        body: z.string().optional().describe("Pull request body"),
        head: z.string().describe("Head branch"),
        base: z.string().describe("Base branch"),
        draft: z.boolean().optional().describe("Create as draft"),
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
          },
        );
        return response.data;
      },
    },

    // Create pull request review
    "pulls.createReview": {
      name: "pulls.createReview",
      displayName: "Create Pull Request Review",
      description: "Create a review on an existing pull request",

      parameters: z.object({
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        pullNumber: z.number().describe("Pull request number"),
        body: z.string().describe("Review body"),
        event: z
          .enum(["APPROVE", "REQUEST_CHANGES", "COMMENT"])
          .describe("Review event type"),
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
          },
        );
        return response.data;
      },
    },

    "releases.list": {
      name: "releases.list",
      displayName: "List Releases",
      description: "List releases for a repository",
      parameters: z.object({
        owner: z.string(),
        repo: z.string(),
        maxPages: z.number().int().min(1).max(100).optional().default(100),
      }),
      returns: z.array(
        z
          .object({
            id: z.number(),
            tag_name: z.string(),
            name: z.string().nullable(),
            body: z.string().nullable(),
            html_url: z.string(),
            draft: z.boolean(),
            prerelease: z.boolean(),
            published_at: z.string().nullable(),
            target_commitish: z.string(),
          })
          .passthrough(),
      ),
      execute: async (params: any, context: ActionContext) => {
        const rows: any[] = [];
        for (let page = 1; page <= (params.maxPages ?? 100); page += 1) {
          const response = await context.http.get(
            `${context.provider.baseUrl}/repos/${params.owner}/${params.repo}/releases`,
            { params: { per_page: 100, page } },
          );
          const pageRows = Array.isArray(response.data) ? response.data : [];
          rows.push(...pageRows);
          if (pageRows.length < 100) break;
        }
        return rows;
      },
    },

    "releases.create": {
      name: "releases.create",
      displayName: "Create Release",
      description: "Create a repository release",
      parameters: z.object({
        owner: z.string(),
        repo: z.string(),
        tagName: z.string().min(1),
        name: z.string().optional(),
        body: z.string().optional(),
        targetCommitish: z.string().optional(),
        draft: z.boolean().optional().default(false),
        prerelease: z.boolean().optional().default(false),
      }),
      returns: z
        .object({
          id: z.number(),
          tag_name: z.string(),
          name: z.string().nullable(),
          body: z.string().nullable(),
          html_url: z.string(),
          draft: z.boolean(),
          prerelease: z.boolean(),
          published_at: z.string().nullable(),
          target_commitish: z.string(),
        })
        .passthrough(),
      execute: async (params: any, context: ActionContext) => {
        const response = await context.http.post(
          `${context.provider.baseUrl}/repos/${params.owner}/${params.repo}/releases`,
          {
            tag_name: params.tagName,
            name: params.name,
            body: params.body,
            target_commitish: params.targetCommitish,
            draft: params.draft ?? false,
            prerelease: params.prerelease ?? false,
          },
        );
        return response.data;
      },
    },
    "hooks.list": {
      name: "hooks.list",
      displayName: "List Repository Webhooks",
      description: "List webhooks configured for a repository",
      parameters: z.object({
        owner: z.string(),
        repo: z.string(),
        maxPages: z.number().int().min(1).max(10).optional().default(10),
      }),
      returns: z.array(
        z
          .object({
            id: z.number(),
            active: z.boolean(),
            events: z.array(z.string()),
            config: z
              .object({
                url: z.string().optional(),
                content_type: z.string().optional(),
                insecure_ssl: z.union([z.string(), z.number()]).optional(),
              })
              .passthrough(),
          })
          .passthrough(),
      ),
      execute: async (params: any, context: ActionContext) => {
        const rows: any[] = [];
        for (let page = 1; page <= (params.maxPages ?? 10); page += 1) {
          const response = await context.http.get(
            `${context.provider.baseUrl}/repos/${params.owner}/${params.repo}/hooks`,
            { params: { per_page: 100, page } },
          );
          const pageRows = Array.isArray(response.data) ? response.data : [];
          rows.push(...pageRows);
          if (pageRows.length < 100) break;
          }
        return rows;
      },
    },
    "hooks.create": {
      name: "hooks.create",
      displayName: "Create Repository Webhook",
      description: "Create a signed JSON webhook for repository events",
      parameters: z.object({
        owner: z.string(),
        repo: z.string(),
        url: z.string().url(),
        secret: z.string().min(1),
        events: z
          .array(z.enum(["issues", "pull_request", "issue_comment", "push"]))
          .min(1),
        active: z.boolean().optional().default(true),
      }),
      returns: z
        .object({
          id: z.number(),
          active: z.boolean(),
          events: z.array(z.string()),
          config: z
            .object({
              url: z.string().optional(),
              content_type: z.string().optional(),
              insecure_ssl: z.union([z.string(), z.number()]).optional(),
            })
            .passthrough(),
        })
        .passthrough(),
      execute: async (params: any, context: ActionContext) => {
        const response = await context.http.post(
          `${context.provider.baseUrl}/repos/${params.owner}/${params.repo}/hooks`,
          {
            name: "web",
            active: params.active ?? true,
            events: params.events,
            config: {
              url: params.url,
              content_type: "json",
              secret: params.secret,
              insecure_ssl: "0",
            },
          },
        );
        return response.data;
      },
    },
    "hooks.delete": {
      name: "hooks.delete",
      displayName: "Delete Repository Webhook",
      description: "Delete a repository webhook",
      parameters: z.object({
        owner: z.string(),
        repo: z.string(),
        hookId: z.number().int().positive(),
      }),
      returns: z.object({ deleted: z.boolean() }),
      execute: async (params: any, context: ActionContext) => {
        await context.http.delete(
          `${context.provider.baseUrl}/repos/${params.owner}/${params.repo}/hooks/${params.hookId}`,
        );
        return { deleted: true };
      },
    },
    "commits.list": {
      name: "commits.list",
      displayName: "List Repository Commits",
      description: "List commits for a repository",
      parameters: z.object({
        owner: z.string(),
        repo: z.string(),
        sha: z.string().optional(),
        since: z.string().datetime().optional(),
        maxPages: z.number().int().min(1).max(100).optional().default(100),
      }),
      returns: z.array(
        z
          .object({
            sha: z.string(),
            html_url: z.string(),
            commit: z.object({
              message: z.string(),
              author: z
                .object({
                  name: z.string(),
                  email: z.string().nullable().optional(),
                  date: z.string(),
                })
                .nullable(),
              committer: z
                .object({
                  name: z.string(),
                  email: z.string().nullable().optional(),
                  date: z.string(),
                })
                .nullable(),
            }),
            author: z.object({ login: z.string() }).nullable().optional(),
          })
          .passthrough(),
      ),
      execute: async (params: any, context: ActionContext) => {
        const rows: any[] = [];
        const query: Record<string, unknown> = { per_page: 100 };
        if (params.sha) query.sha = params.sha;
        if (params.since) query.since = params.since;
        for (let page = 1; page <= (params.maxPages ?? 100); page += 1) {
          const response = await context.http.get(
            `${context.provider.baseUrl}/repos/${params.owner}/${params.repo}/commits`,
            { params: { ...query, page } },
          );
          const pageRows = Array.isArray(response.data) ? response.data : [];
          rows.push(...pageRows);
          if (pageRows.length < 100) break;
        }
        return rows;
      },
    },
  },

  triggers: {
    issues: {
      name: "issues",
      displayName: "Issue Event",
      description: "Triggered when a GitHub issue is created or updated",
      type: TriggerType.Webhook,

      webhookConfig: {
        path: "/webhooks/github/issues",
        method: "POST",
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
          labels: z
            .array(z.object({ name: z.string(), color: z.string().optional() }))
            .optional(),
          assignees: z
            .array(
              z.object({
                login: z.string(),
                avatar_url: z.string().optional(),
              }),
            )
            .optional(),
          milestone: z
            .object({ title: z.string(), due_on: z.string().nullable() })
            .nullable()
            .optional(),
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
          event: "issues",
          data: payload,
        };
      },
    },
    "issues.opened": {
      name: "issues.opened",
      displayName: "Issue Opened",
      description: "Triggered when an issue is opened",
      type: TriggerType.Webhook,

      webhookConfig: {
        path: "/webhooks/github/issues",
        method: "POST",
        verifySignature: async (payload, signature, secret, context) => {
          return verifyGitHubSignatureRaw(payload, signature, secret, context);
        },
      },

      schema: z.object({
        action: z.literal("opened"),
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
          event: "issues.opened",
          data: payload,
        };
      },
    },
    pull_request: {
      name: "pull_request",
      displayName: "Pull Request Event",
      description: "Triggered when a pull request changes",
      type: TriggerType.Webhook,
      webhookConfig: {
        path: "/webhooks/github/pull-request",
        method: "POST",
        verifySignature: async (payload, signature, secret, context) =>
          verifyGitHubSignatureRaw(payload, signature, secret, context),
      },
      schema: z
        .object({
          action: z.string(),
          pull_request: z
            .object({
              id: z.number(),
              number: z.number(),
              title: z.string(),
              html_url: z.string(),
              state: z.string(),
              draft: z.boolean().optional(),
              merged: z.boolean().optional(),
              merged_at: z.string().nullable().optional(),
              closed_at: z.string().nullable().optional(),
              user: z.object({ login: z.string() }).nullable().optional(),
              head: z.object({ ref: z.string(), sha: z.string().optional() }),
              base: z.object({ ref: z.string(), sha: z.string().optional() }),
              requested_reviewers: z
                .array(z.object({ login: z.string() }))
                .optional(),
              requested_teams: z
                .array(z.object({ name: z.string() }))
                .optional(),
            })
            .passthrough(),
          repository: z
            .object({
              id: z.number().optional(),
              name: z.string(),
              full_name: z.string(),
              owner: z.object({ login: z.string() }),
            })
            .passthrough(),
        })
        .passthrough(),
      handler: async (payload) => ({ event: "pull_request", data: payload }),
    },
    "pull_request.closed": {
      name: "pull_request.closed",
      displayName: "Pull Request Closed",
      description: "Triggered when a pull request is closed",
      type: TriggerType.Webhook,

      webhookConfig: {
        path: "/webhooks/github/pull-request",
        method: "POST",
        verifySignature: async (payload, signature, secret, context) => {
          return verifyGitHubSignatureRaw(payload, signature, secret, context);
        },
      },

      schema: z.object({
        action: z.literal("closed"),
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
          event: "pull_request.closed",
          data: payload,
        };
      },
    },
    "issue_comment.created": {
      name: "issue_comment.created",
      displayName: "Issue Comment Created",
      description: "Triggered when an issue comment is created",
      type: TriggerType.Webhook,

      webhookConfig: {
        path: "/webhooks/github/issue-comment",
        method: "POST",
        verifySignature: async (payload, signature, secret, context) => {
          return verifyGitHubSignatureRaw(payload, signature, secret, context);
        },
      },

      schema: z.object({
        action: z.literal("created"),
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
          event: "issue_comment.created",
          data: payload,
        };
      },
    },
    issue_comment: {
      name: "issue_comment",
      displayName: "Issue Comment Event",
      description: "Triggered when an issue or pull-request comment changes",
      type: TriggerType.Webhook,
      webhookConfig: {
        path: "/webhooks/github/issue-comment",
        method: "POST",
        verifySignature: async (payload, signature, secret, context) =>
          verifyGitHubSignatureRaw(payload, signature, secret, context),
      },
      schema: z
        .object({
          action: z.string(),
          issue: z
            .object({
              id: z.number(),
              number: z.number(),
              title: z.string(),
              html_url: z.string(),
              pull_request: z.object({ url: z.string() }).optional(),
            })
            .passthrough(),
          comment: z
            .object({
              id: z.number(),
              body: z.string(),
              html_url: z.string().optional(),
              user: z.object({ login: z.string() }).optional(),
            })
            .passthrough(),
          repository: z
            .object({
              id: z.number().optional(),
              name: z.string(),
              full_name: z.string(),
              owner: z.object({ login: z.string() }),
            })
            .passthrough(),
        })
        .passthrough(),
      handler: async (payload) => ({ event: "issue_comment", data: payload }),
    },
    push: {
      name: "push",
      displayName: "Push Event",
      description: "Triggered when commits are pushed to a repository",
      type: TriggerType.Webhook,
      webhookConfig: {
        path: "/webhooks/github/push",
        method: "POST",
        verifySignature: async (payload, signature, secret, context) =>
          verifyGitHubSignatureRaw(payload, signature, secret, context),
      },
      schema: z
        .object({
          ref: z.string(),
          repository: z
            .object({
              id: z.number().optional(),
              name: z.string(),
              full_name: z.string(),
              owner: z.object({ login: z.string() }),
            })
            .passthrough(),
          commits: z.array(
            z
              .object({
                id: z.string(),
                message: z.string(),
                url: z.string(),
                timestamp: z.string(),
                author: z.object({
                  name: z.string(),
                  email: z.string().nullable().optional(),
                  username: z.string().optional(),
                }),
              })
              .passthrough(),
          ),
        })
        .passthrough(),
      handler: async (payload) => ({ event: "push", data: payload }),
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
  context: WebhookVerificationContext,
): boolean {
  return verifyRawBodyHmac({ signature, secret, context, algorithm: "sha256" });
}
