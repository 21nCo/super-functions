import type { Provider, ActionContract } from "plugfn";

/** Reviewed hints, not authorization. Parameters name top-level input fields;
 * structured inputs need consumer interpretation. Parameterless hints refer to
 * collections or the trusted connected account/site. Optional fields do not
 * imply a narrower scope when omitted. Never infer a grant from these hints. */
const repositoryResources: ActionContract["resources"] = [
  { kind: "owner", parameter: "owner" },
  { kind: "repository", parameter: "repo" },
];
const repositoryIssueResources: ActionContract["resources"] = [
  { kind: "owner", parameter: "owner" },
  { kind: "repository", parameter: "repo" },
  { kind: "issue", parameter: "issueNumber" },
];
const pullRequestResources: ActionContract["resources"] = [
  { kind: "owner", parameter: "owner" },
  { kind: "repository", parameter: "repo" },
  { kind: "pull-request", parameter: "pullNumber" },
];
const teamResources: ActionContract["resources"] = [
  { kind: "team", parameter: "teamId" },
];
const issueResources: ActionContract["resources"] = [
  { kind: "issue", parameter: "issueId" },
];
const documentCollectionResources: ActionContract["resources"] = [
  { kind: "document-collection" },
];
const pageResources: ActionContract["resources"] = [
  { kind: "page", parameter: "pageId" },
];
const blockResources: ActionContract["resources"] = [
  { kind: "block", parameter: "blockId" },
];
const listResources: ActionContract["resources"] = [
  { kind: "list", parameter: "listId" },
];
const taskResources: ActionContract["resources"] = [
  { kind: "task", parameter: "taskId" },
];
const conversationMessageResources: ActionContract["resources"] = [
  { kind: "conversation", parameter: "channel" },
  { kind: "message", parameter: "ts" },
];
const connectedMailboxResources: ActionContract["resources"] = [
  { kind: "connected-mailbox" },
];
const messageResources: ActionContract["resources"] = [
  { kind: "message", parameter: "id" },
];
const draftResources: ActionContract["resources"] = [
  { kind: "draft", parameter: "id" },
];
const driveSearchResources: ActionContract["resources"] = [
  { kind: "drive", parameter: "driveId" },
  { kind: "search-query", parameter: "q" },
];
const fileResources: ActionContract["resources"] = [
  { kind: "file", parameter: "fileId" },
];
const documentResources: ActionContract["resources"] = [
  { kind: "document", parameter: "documentId" },
];
const spreadsheetRangesResources: ActionContract["resources"] = [
  { kind: "spreadsheet", parameter: "spreadsheetId" },
  { kind: "range", parameter: "ranges" },
];
const spreadsheetRangeResources: ActionContract["resources"] = [
  { kind: "spreadsheet", parameter: "spreadsheetId" },
  { kind: "range", parameter: "range" },
];
const calendarCollectionResources: ActionContract["resources"] = [
  { kind: "calendar-collection" },
];
const calendarResources: ActionContract["resources"] = [
  { kind: "calendar", parameter: "calendarId" },
];
const calendarEventResources: ActionContract["resources"] = [
  { kind: "calendar", parameter: "calendarId" },
  { kind: "event", parameter: "eventId" },
];
const siteIssueResources: ActionContract["resources"] = [
  { kind: "connected-site" },
  { kind: "issue", parameter: "issueIdOrKey" },
];
const eventResources: ActionContract["resources"] = [
  { kind: "event", parameter: "id" },
];
const driveItemResources: ActionContract["resources"] = [
  { kind: "drive", parameter: "driveId" },
  { kind: "drive-item", parameter: "itemId" },
];

// Each action receives independent hint objects, preserving the public mutable shape.
function copyHints(
  hints: ActionContract["resources"],
): ActionContract["resources"] {
  return hints.map((hint) => ({ ...hint }));
}

export const selectedResources: Record<
  string,
  Record<string, ActionContract["resources"]>
> = {
  github: {
    "repos.list": [{ kind: "repository-collection" }],
    "issues.list": copyHints(repositoryResources),
    "issues.get": copyHints(repositoryIssueResources),
    "issues.create": copyHints(repositoryResources),
    "issues.update": copyHints(repositoryIssueResources),
    "issues.comments.list": copyHints(repositoryResources),
    "issues.comments.create": copyHints(repositoryIssueResources),
    "pulls.list": copyHints(repositoryResources),
    "pulls.get": copyHints(pullRequestResources),
    "pulls.create": [
      { kind: "owner", parameter: "owner" },
      { kind: "repository", parameter: "repo" },
      { kind: "branch", parameter: "head" },
      { kind: "branch", parameter: "base" },
    ],
    "pulls.review": copyHints(pullRequestResources),
  },
  linear: {
    "teams.list": [{ kind: "team-collection" }],
    "issues.search": copyHints(teamResources),
    "issues.list": copyHints(teamResources),
    "issues.get": copyHints(issueResources),
    "issues.create": copyHints(teamResources),
    "issues.update": copyHints(issueResources),
    "comments.list": [{ kind: "comment-collection" }],
    "comments.create": copyHints(issueResources),
    "documents.list": copyHints(documentCollectionResources),
    "documents.get": [{ kind: "document", parameter: "id" }],
  },
  notion: {
    search: [{ kind: "shared-content-collection" }],
    "pages.get": copyHints(pageResources),
    "pages.create": [{ kind: "parent", parameter: "parent" }],
    "pages.update": copyHints(pageResources),
    "blocks.children.list": copyHints(blockResources),
    "blocks.children.append": copyHints(blockResources),
    "dataSources.list": [{ kind: "database", parameter: "databaseId" }],
    "dataSources.query": [{ kind: "data-source", parameter: "dataSourceId" }],
  },
  clickup: {
    "spaces.list": [{ kind: "workspace", parameter: "teamId" }],
    "lists.list": [
      { kind: "space", parameter: "spaceId" },
      { kind: "folder", parameter: "folderId" },
    ],
    "tasks.list": copyHints(listResources),
    "tasks.get": copyHints(taskResources),
    "tasks.create": copyHints(listResources),
    "tasks.update": copyHints(taskResources),
    "comments.list": copyHints(taskResources),
    "comments.create": copyHints(taskResources),
  },
  slack: {
    "conversations.list": [{ kind: "conversation-collection" }],
    "conversations.history": [{ kind: "conversation", parameter: "channel" }],
    "conversations.replies": copyHints(conversationMessageResources),
    "search.messages": [{ kind: "search-query", parameter: "query" }],
    "users.info": [{ kind: "user", parameter: "user" }],
    "messages.post": [
      { kind: "conversation", parameter: "channel" },
      { kind: "message", parameter: "thread_ts" },
    ],
    "messages.update": copyHints(conversationMessageResources),
    "files.upload": [
      { kind: "conversation", parameter: "channel_id" },
      { kind: "message", parameter: "thread_ts" },
    ],
  },
  gmail: {
    "messages.list": copyHints(connectedMailboxResources),
    "messages.get": copyHints(messageResources),
    "threads.get": [{ kind: "thread", parameter: "id" }],
    "attachments.get": [
      { kind: "message", parameter: "messageId" },
      { kind: "attachment", parameter: "id" },
    ],
    "labels.list": copyHints(connectedMailboxResources),
    "messages.modify": copyHints(messageResources),
    "drafts.create": copyHints(connectedMailboxResources),
    "drafts.update": copyHints(draftResources),
    "drafts.send": [{ kind: "draft-input", parameter: "body" }],
    "messages.send": copyHints(connectedMailboxResources),
  },
  "google-drive": {
    "files.search": copyHints(driveSearchResources),
    "files.get": copyHints(fileResources),
    "files.download": copyHints(fileResources),
    "files.export": copyHints(fileResources),
    "files.create": [{ kind: "file-parent-input", parameter: "body" }],
    "files.update": [
      { kind: "file", parameter: "fileId" },
      { kind: "parent", parameter: "addParents" },
      { kind: "parent", parameter: "removeParents" },
    ],
    "permissions.list": copyHints(fileResources),
    "permissions.create": copyHints(fileResources),
    "permissions.delete": [
      { kind: "file", parameter: "fileId" },
      { kind: "permission", parameter: "permissionId" },
    ],
  },
  "google-docs": {
    "documents.get": copyHints(documentResources),
    "documents.create": copyHints(documentCollectionResources),
    "documents.batchUpdate": copyHints(documentResources),
  },
  "google-sheets": {
    "spreadsheets.get": copyHints(spreadsheetRangesResources),
    "spreadsheets.create": [{ kind: "spreadsheet-collection" }],
    "values.get": copyHints(spreadsheetRangeResources),
    "values.batchGet": copyHints(spreadsheetRangesResources),
    "values.update": copyHints(spreadsheetRangeResources),
    "values.append": copyHints(spreadsheetRangeResources),
    "spreadsheets.batchUpdate": [
      { kind: "spreadsheet", parameter: "spreadsheetId" },
    ],
  },
  "google-calendar": {
    "calendars.list": copyHints(calendarCollectionResources),
    "events.list": copyHints(calendarResources),
    "events.get": copyHints(calendarEventResources),
    "events.create": copyHints(calendarResources),
    "events.update": copyHints(calendarEventResources),
    "events.delete": copyHints(calendarEventResources),
    "freebusy.query": [{ kind: "calendar-input", parameter: "body" }],
  },
  jira: {
    "sites.list": [{ kind: "accessible-site-collection" }],
    "projects.list": [{ kind: "connected-site" }],
    "issues.search": [
      { kind: "connected-site" },
      { kind: "search-query", parameter: "jql" },
    ],
    "issues.get": copyHints(siteIssueResources),
    "issues.create": [
      { kind: "connected-site" },
      { kind: "issue-fields", parameter: "fields" },
    ],
    "issues.update": copyHints(siteIssueResources),
    "comments.list": copyHints(siteIssueResources),
    "comments.create": copyHints(siteIssueResources),
    "transitions.list": copyHints(siteIssueResources),
    "transitions.apply": [
      { kind: "connected-site" },
      { kind: "issue", parameter: "issueIdOrKey" },
      { kind: "transition", parameter: "transitionId" },
    ],
  },
  outlook: {
    "mail.messages.list": copyHints(connectedMailboxResources),
    "mail.messages.get": copyHints(messageResources),
    "mail.attachments.get": [
      { kind: "message", parameter: "id" },
      { kind: "attachment", parameter: "attachmentId" },
    ],
    "mail.drafts.create": copyHints(connectedMailboxResources),
    "mail.drafts.send": copyHints(draftResources),
    "mail.messages.send": copyHints(connectedMailboxResources),
    "calendars.list": copyHints(calendarCollectionResources),
    "events.list": copyHints(calendarResources),
    "events.get": copyHints(eventResources),
    "events.create": copyHints(calendarResources),
    "events.update": copyHints(eventResources),
    "events.delete": copyHints(eventResources),
  },
  onedrive: {
    "drives.list": [{ kind: "drive-collection" }],
    "items.search": copyHints(driveSearchResources),
    "items.get": copyHints(driveItemResources),
    "items.download": copyHints(driveItemResources),
    "items.upload": [
      { kind: "drive", parameter: "driveId" },
      { kind: "parent-item", parameter: "parentId" },
    ],
    "permissions.list": copyHints(driveItemResources),
    "permissions.create": copyHints(driveItemResources),
    "permissions.delete": [
      { kind: "drive", parameter: "driveId" },
      { kind: "drive-item", parameter: "itemId" },
      { kind: "permission", parameter: "permissionId" },
    ],
  },
};

export function applySelectedResources(provider: Provider): void {
  for (const [name, resources] of Object.entries(
    selectedResources[provider.name] ?? {},
  )) {
    const action = provider.actions[name];
    if (!action?.contract)
      throw new Error(`Missing selected contract ${provider.name}.${name}`);
    action.contract = {
      ...action.contract,
      version: "1.1.0",
      resources: resources.map((value) => ({ ...value })),
    };
  }
}
