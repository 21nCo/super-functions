import { applySelectedResources } from '../shared/selected-resources.js';
import { z } from "zod";
import { AuthType, type ActionContext, type Action, type Provider } from "plugfn";
import {
  restAction,
  jsonObject,
  remoteId,
  segment,
} from "../shared/rest-action.js";

function site(context: ActionContext) {
  const id = context.connectionMetadata?.cloudId;
  if (typeof id !== "string" || !id)
    throw new Error("JIRA_CONNECTION_SITE_REQUIRED");
  return `https://api.atlassian.com/ex/jira/${segment(id)}/rest/api/3`;
}
const issue = z.object({ issueIdOrKey: remoteId });
const paging = z.object({
  startAt: z.number().int().nonnegative().optional(),
  maxResults: z.number().int().min(1).max(100).optional(),
});
const ok = z.object({ success: z.literal(true) });
const read = ["read:jira-work"];
const write = ["write:jira-work"];
export const jiraProvider: Provider<Record<string, Action>> = {
  name: "jira",
  displayName: "Jira",
  description: "Atlassian Cloud site-bound Jira actions",
  version: "1.0.0",
  baseUrl: "https://api.atlassian.com",
  auth: {
    type: AuthType.OAuth2,
    config: {
      authorizationUrl: "https://auth.atlassian.com/authorize",
      tokenUrl: "https://auth.atlassian.com/oauth/token",
      scopes: [...read, ...write, "offline_access"],
      supportsPkce: false,
      tokenBodyEncoding: "json",
      extraAuthParams: { audience: "api.atlassian.com", prompt: "consent" },
    },
  },
  actions: {
    "sites.list": restAction({
      name: "sites.list",
      method: "GET",
      path: () => "https://api.atlassian.com/oauth/token/accessible-resources",
      parameters: z.object({}).strict(),
      returns: z.array(
        z
          .object({
            id: z.string(),
            url: z.string(),
            scopes: z.array(z.string()),
          })
          .passthrough(),
      ),
      scopes: read,
    }),
    "projects.list": restAction({
      name: "projects.list",
      method: "GET",
      path: (_, c) => `${site(c)}/project/search`,
      parameters: paging.strict(),
      query: (p) => p,
      returns: z.object({ values: z.array(jsonObject) }).passthrough(),
      scopes: read,
      pagination: { kind: "offset", maxPageSize: 100 },
    }),
    "issues.search": restAction({
      name: "issues.search",
      method: "POST",
      read: true,
      path: (_, c) => `${site(c)}/search/jql`,
      parameters: z
        .object({
          jql: z.string().min(1),
          nextPageToken: z.string().optional(),
          maxResults: z.number().int().min(1).max(100).optional(),
          fields: z.array(z.string()).optional(),
        })
        .strict(),
      body: (p) => p,
      returns: z
        .object({
          issues: z.array(jsonObject),
          nextPageToken: z.string().optional(),
        })
        .passthrough(),
      scopes: read,
      pagination: {
        kind: "cursor",
        cursorParameter: "nextPageToken",
        maxPageSize: 100,
      },
    }),
    "issues.get": restAction({
      name: "issues.get",
      method: "GET",
      path: (p, c) => `${site(c)}/issue/${segment(p.issueIdOrKey)}`,
      parameters: issue.strict(),
      returns: z
        .object({ id: z.string(), key: z.string(), fields: jsonObject })
        .passthrough(),
      scopes: read,
    }),
    "issues.create": restAction({
      name: "issues.create",
      method: "POST",
      path: (_, c) => `${site(c)}/issue`,
      parameters: z
        .object({ fields: jsonObject, update: jsonObject.optional() })
        .strict(),
      body: (p) => p,
      returns: z.object({ id: z.string(), key: z.string() }).passthrough(),
      scopes: write,
    }),
    "issues.update": restAction({
      name: "issues.update",
      method: "PUT",
      path: (p, c) => `${site(c)}/issue/${segment(p.issueIdOrKey)}`,
      parameters: issue.extend({ fields: jsonObject }).strict(),
      body: (p) => ({ fields: p.fields }),
      returns: ok,
      scopes: write,
    }),
    "comments.list": restAction({
      name: "comments.list",
      method: "GET",
      path: (p, c) => `${site(c)}/issue/${segment(p.issueIdOrKey)}/comment`,
      parameters: issue.merge(paging).strict(),
      query: ({ startAt, maxResults }) => ({ startAt, maxResults }),
      returns: z.object({ comments: z.array(jsonObject) }).passthrough(),
      scopes: read,
      pagination: { kind: "offset", maxPageSize: 100 },
    }),
    "comments.create": restAction({
      name: "comments.create",
      method: "POST",
      path: (p, c) => `${site(c)}/issue/${segment(p.issueIdOrKey)}/comment`,
      parameters: issue.extend({ body: jsonObject }).strict(),
      body: (p) => ({ body: p.body }),
      returns: z.object({ id: z.string() }).passthrough(),
      scopes: write,
    }),
    "transitions.list": restAction({
      name: "transitions.list",
      method: "GET",
      path: (p, c) => `${site(c)}/issue/${segment(p.issueIdOrKey)}/transitions`,
      parameters: issue.strict(),
      returns: z.object({ transitions: z.array(jsonObject) }).passthrough(),
      scopes: read,
    }),
    "transitions.apply": restAction({
      name: "transitions.apply",
      method: "POST",
      path: (p, c) => `${site(c)}/issue/${segment(p.issueIdOrKey)}/transitions`,
      parameters: issue
        .extend({ transitionId: remoteId, fields: jsonObject.optional() })
        .strict(),
      body: (p) => ({ transition: { id: p.transitionId }, fields: p.fields }),
      returns: ok,
      scopes: write,
    }),
  },
};

// Public callers select a site using action input. Validate it against the same
// credential's accessible resources before dispatching any site-specific action.
for (const [name, action] of Object.entries(jiraProvider.actions)) {
  if (name === "sites.list") continue;
  const parameters = (action.parameters as z.AnyZodObject).extend({ cloudId: remoteId.optional() });
  const execute = action.execute;
  action.parameters = parameters;
  action.execute = async (input, context) => {
    const { cloudId, ...params } = parameters.parse(input);
    if (cloudId === undefined) return execute(params, context);
    const response = await context.http.get("https://api.atlassian.com/oauth/token/accessible-resources", { redirect: "error" });
    const resources = z.array(z.object({ id: z.string(), scopes: z.array(z.string()) })).parse(response.data);
    const selected = resources.find(resource => resource.id === cloudId);
    if (!selected || !(action.contract?.requiredScopes ?? []).every(scope => selected.scopes.includes(scope))) {
      throw new Error("JIRA_CONNECTION_SITE_FORBIDDEN");
    }
    return execute(params, { ...context, connectionMetadata: { ...context.connectionMetadata, cloudId } });
  };
}

applySelectedResources(jiraProvider);
