import type { Provider, ActionContract } from "plugfn";

/** Reviewed hints, not authorization. Parameters name top-level input fields;
 * structured inputs need consumer interpretation. Parameterless hints refer to
 * collections or the trusted connected account/site. Optional fields do not
 * imply a narrower scope when omitted. Never infer a grant from these hints. */
export const selectedResources: Record<
  string,
  Record<string, ActionContract["resources"]>
> = {
  github: {
    "repos.list": [
      {
        kind: "repository-collection",
      },
    ],
    "issues.list": [
      {
        kind: "owner",
        parameter: "owner",
      },
      {
        kind: "repository",
        parameter: "repo",
      },
    ],
    "issues.get": [
      {
        kind: "owner",
        parameter: "owner",
      },
      {
        kind: "repository",
        parameter: "repo",
      },
      {
        kind: "issue",
        parameter: "issueNumber",
      },
    ],
    "issues.create": [
      {
        kind: "owner",
        parameter: "owner",
      },
      {
        kind: "repository",
        parameter: "repo",
      },
    ],
    "issues.update": [
      {
        kind: "owner",
        parameter: "owner",
      },
      {
        kind: "repository",
        parameter: "repo",
      },
      {
        kind: "issue",
        parameter: "issueNumber",
      },
    ],
    "issues.comments.list": [
      {
        kind: "owner",
        parameter: "owner",
      },
      {
        kind: "repository",
        parameter: "repo",
      },
    ],
    "issues.comments.create": [
      {
        kind: "owner",
        parameter: "owner",
      },
      {
        kind: "repository",
        parameter: "repo",
      },
      {
        kind: "issue",
        parameter: "issueNumber",
      },
    ],
    "pulls.list": [
      {
        kind: "owner",
        parameter: "owner",
      },
      {
        kind: "repository",
        parameter: "repo",
      },
    ],
    "pulls.get": [
      {
        kind: "owner",
        parameter: "owner",
      },
      {
        kind: "repository",
        parameter: "repo",
      },
      {
        kind: "pull-request",
        parameter: "pullNumber",
      },
    ],
    "pulls.create": [
      {
        kind: "owner",
        parameter: "owner",
      },
      {
        kind: "repository",
        parameter: "repo",
      },
      {
        kind: "branch",
        parameter: "head",
      },
      {
        kind: "branch",
        parameter: "base",
      },
    ],
    "pulls.review": [
      {
        kind: "owner",
        parameter: "owner",
      },
      {
        kind: "repository",
        parameter: "repo",
      },
      {
        kind: "pull-request",
        parameter: "pullNumber",
      },
    ],
  },
  linear: {
    "teams.list": [
      {
        kind: "team-collection",
      },
    ],
    "issues.search": [
      {
        kind: "team",
        parameter: "teamId",
      },
    ],
    "issues.list": [
      {
        kind: "team",
        parameter: "teamId",
      },
    ],
    "issues.get": [
      {
        kind: "issue",
        parameter: "issueId",
      },
    ],
    "issues.create": [
      {
        kind: "team",
        parameter: "teamId",
      },
    ],
    "issues.update": [
      {
        kind: "issue",
        parameter: "issueId",
      },
    ],
    "comments.list": [
      {
        kind: "comment-collection",
      },
    ],
    "comments.create": [
      {
        kind: "issue",
        parameter: "issueId",
      },
    ],
    "documents.list": [
      {
        kind: "document-collection",
      },
    ],
    "documents.get": [
      {
        kind: "document",
        parameter: "id",
      },
    ],
  },
  notion: {
    search: [
      {
        kind: "shared-content-collection",
      },
    ],
    "pages.get": [
      {
        kind: "page",
        parameter: "pageId",
      },
    ],
    "pages.create": [
      {
        kind: "parent",
        parameter: "parent",
      },
    ],
    "pages.update": [
      {
        kind: "page",
        parameter: "pageId",
      },
    ],
    "blocks.children.list": [
      {
        kind: "block",
        parameter: "blockId",
      },
    ],
    "blocks.children.append": [
      {
        kind: "block",
        parameter: "blockId",
      },
    ],
    "dataSources.list": [
      {
        kind: "database",
        parameter: "databaseId",
      },
    ],
    "dataSources.query": [
      {
        kind: "data-source",
        parameter: "dataSourceId",
      },
    ],
  },
  clickup: {
    "spaces.list": [
      {
        kind: "workspace",
        parameter: "teamId",
      },
    ],
    "lists.list": [
      {
        kind: "space",
        parameter: "spaceId",
      },
      {
        kind: "folder",
        parameter: "folderId",
      },
    ],
    "tasks.list": [
      {
        kind: "list",
        parameter: "listId",
      },
    ],
    "tasks.get": [
      {
        kind: "task",
        parameter: "taskId",
      },
    ],
    "tasks.create": [
      {
        kind: "list",
        parameter: "listId",
      },
    ],
    "tasks.update": [
      {
        kind: "task",
        parameter: "taskId",
      },
    ],
    "comments.list": [
      {
        kind: "task",
        parameter: "taskId",
      },
    ],
    "comments.create": [
      {
        kind: "task",
        parameter: "taskId",
      },
    ],
  },
  slack: {
    "conversations.list": [
      {
        kind: "conversation-collection",
      },
    ],
    "conversations.history": [
      {
        kind: "conversation",
        parameter: "channel",
      },
    ],
    "conversations.replies": [
      {
        kind: "conversation",
        parameter: "channel",
      },
      {
        kind: "message",
        parameter: "ts",
      },
    ],
    "search.messages": [
      {
        kind: "search-query",
        parameter: "query",
      },
    ],
    "users.info": [
      {
        kind: "user",
        parameter: "user",
      },
    ],
    "messages.post": [
      {
        kind: "conversation",
        parameter: "channel",
      },
      {
        kind: "message",
        parameter: "thread_ts",
      },
    ],
    "messages.update": [
      {
        kind: "conversation",
        parameter: "channel",
      },
      {
        kind: "message",
        parameter: "ts",
      },
    ],
    "files.upload": [
      {
        kind: "conversation",
        parameter: "channel_id",
      },
      {
        kind: "message",
        parameter: "thread_ts",
      },
    ],
  },
  gmail: {
    "messages.list": [
      {
        kind: "connected-mailbox",
      },
    ],
    "messages.get": [
      {
        kind: "message",
        parameter: "id",
      },
    ],
    "threads.get": [
      {
        kind: "thread",
        parameter: "id",
      },
    ],
    "attachments.get": [
      {
        kind: "message",
        parameter: "messageId",
      },
      {
        kind: "attachment",
        parameter: "id",
      },
    ],
    "labels.list": [
      {
        kind: "connected-mailbox",
      },
    ],
    "messages.modify": [
      {
        kind: "message",
        parameter: "id",
      },
    ],
    "drafts.create": [
      {
        kind: "connected-mailbox",
      },
    ],
    "drafts.update": [
      {
        kind: "draft",
        parameter: "id",
      },
    ],
    "drafts.send": [
      {
        kind: "draft-input",
        parameter: "body",
      },
    ],
    "messages.send": [
      {
        kind: "connected-mailbox",
      },
    ],
  },
  "google-drive": {
    "files.search": [
      {
        kind: "drive",
        parameter: "driveId",
      },
      {
        kind: "search-query",
        parameter: "q",
      },
    ],
    "files.get": [
      {
        kind: "file",
        parameter: "fileId",
      },
    ],
    "files.download": [
      {
        kind: "file",
        parameter: "fileId",
      },
    ],
    "files.export": [
      {
        kind: "file",
        parameter: "fileId",
      },
    ],
    "files.create": [
      {
        kind: "file-parent-input",
        parameter: "body",
      },
    ],
    "files.update": [
      {
        kind: "file",
        parameter: "fileId",
      },
      {
        kind: "parent",
        parameter: "addParents",
      },
      {
        kind: "parent",
        parameter: "removeParents",
      },
    ],
    "permissions.list": [
      {
        kind: "file",
        parameter: "fileId",
      },
    ],
    "permissions.create": [
      {
        kind: "file",
        parameter: "fileId",
      },
    ],
    "permissions.delete": [
      {
        kind: "file",
        parameter: "fileId",
      },
      {
        kind: "permission",
        parameter: "permissionId",
      },
    ],
  },
  "google-docs": {
    "documents.get": [
      {
        kind: "document",
        parameter: "documentId",
      },
    ],
    "documents.create": [
      {
        kind: "document-collection",
      },
    ],
    "documents.batchUpdate": [
      {
        kind: "document",
        parameter: "documentId",
      },
    ],
  },
  "google-sheets": {
    "spreadsheets.get": [
      {
        kind: "spreadsheet",
        parameter: "spreadsheetId",
      },
      {
        kind: "range",
        parameter: "ranges",
      },
    ],
    "spreadsheets.create": [
      {
        kind: "spreadsheet-collection",
      },
    ],
    "values.get": [
      {
        kind: "spreadsheet",
        parameter: "spreadsheetId",
      },
      {
        kind: "range",
        parameter: "range",
      },
    ],
    "values.batchGet": [
      {
        kind: "spreadsheet",
        parameter: "spreadsheetId",
      },
      {
        kind: "range",
        parameter: "ranges",
      },
    ],
    "values.update": [
      {
        kind: "spreadsheet",
        parameter: "spreadsheetId",
      },
      {
        kind: "range",
        parameter: "range",
      },
    ],
    "values.append": [
      {
        kind: "spreadsheet",
        parameter: "spreadsheetId",
      },
      {
        kind: "range",
        parameter: "range",
      },
    ],
    "spreadsheets.batchUpdate": [
      {
        kind: "spreadsheet",
        parameter: "spreadsheetId",
      },
    ],
  },
  "google-calendar": {
    "calendars.list": [
      {
        kind: "calendar-collection",
      },
    ],
    "events.list": [
      {
        kind: "calendar",
        parameter: "calendarId",
      },
    ],
    "events.get": [
      {
        kind: "calendar",
        parameter: "calendarId",
      },
      {
        kind: "event",
        parameter: "eventId",
      },
    ],
    "events.create": [
      {
        kind: "calendar",
        parameter: "calendarId",
      },
    ],
    "events.update": [
      {
        kind: "calendar",
        parameter: "calendarId",
      },
      {
        kind: "event",
        parameter: "eventId",
      },
    ],
    "events.delete": [
      {
        kind: "calendar",
        parameter: "calendarId",
      },
      {
        kind: "event",
        parameter: "eventId",
      },
    ],
    "freebusy.query": [
      {
        kind: "calendar-input",
        parameter: "body",
      },
    ],
  },
  jira: {
    "sites.list": [
      {
        kind: "accessible-site-collection",
      },
    ],
    "projects.list": [
      {
        kind: "connected-site",
      },
    ],
    "issues.search": [
      {
        kind: "connected-site",
      },
      {
        kind: "search-query",
        parameter: "jql",
      },
    ],
    "issues.get": [
      {
        kind: "connected-site",
      },
      {
        kind: "issue",
        parameter: "issueIdOrKey",
      },
    ],
    "issues.create": [
      {
        kind: "connected-site",
      },
      {
        kind: "issue-fields",
        parameter: "fields",
      },
    ],
    "issues.update": [
      {
        kind: "connected-site",
      },
      {
        kind: "issue",
        parameter: "issueIdOrKey",
      },
    ],
    "comments.list": [
      {
        kind: "connected-site",
      },
      {
        kind: "issue",
        parameter: "issueIdOrKey",
      },
    ],
    "comments.create": [
      {
        kind: "connected-site",
      },
      {
        kind: "issue",
        parameter: "issueIdOrKey",
      },
    ],
    "transitions.list": [
      {
        kind: "connected-site",
      },
      {
        kind: "issue",
        parameter: "issueIdOrKey",
      },
    ],
    "transitions.apply": [
      {
        kind: "connected-site",
      },
      {
        kind: "issue",
        parameter: "issueIdOrKey",
      },
      {
        kind: "transition",
        parameter: "transitionId",
      },
    ],
  },
  outlook: {
    "mail.messages.list": [
      {
        kind: "connected-mailbox",
      },
    ],
    "mail.messages.get": [
      {
        kind: "message",
        parameter: "id",
      },
    ],
    "mail.attachments.get": [
      {
        kind: "message",
        parameter: "id",
      },
      {
        kind: "attachment",
        parameter: "attachmentId",
      },
    ],
    "mail.drafts.create": [
      {
        kind: "connected-mailbox",
      },
    ],
    "mail.drafts.send": [
      {
        kind: "draft",
        parameter: "id",
      },
    ],
    "mail.messages.send": [
      {
        kind: "connected-mailbox",
      },
    ],
    "calendars.list": [
      {
        kind: "calendar-collection",
      },
    ],
    "events.list": [
      {
        kind: "calendar",
        parameter: "calendarId",
      },
    ],
    "events.get": [
      {
        kind: "event",
        parameter: "id",
      },
    ],
    "events.create": [
      {
        kind: "calendar",
        parameter: "calendarId",
      },
    ],
    "events.update": [
      {
        kind: "event",
        parameter: "id",
      },
    ],
    "events.delete": [
      {
        kind: "event",
        parameter: "id",
      },
    ],
  },
  onedrive: {
    "drives.list": [
      {
        kind: "drive-collection",
      },
    ],
    "items.search": [
      {
        kind: "drive",
        parameter: "driveId",
      },
      {
        kind: "search-query",
        parameter: "q",
      },
    ],
    "items.get": [
      {
        kind: "drive",
        parameter: "driveId",
      },
      {
        kind: "drive-item",
        parameter: "itemId",
      },
    ],
    "items.download": [
      {
        kind: "drive",
        parameter: "driveId",
      },
      {
        kind: "drive-item",
        parameter: "itemId",
      },
    ],
    "items.upload": [
      {
        kind: "drive",
        parameter: "driveId",
      },
      {
        kind: "parent-item",
        parameter: "parentId",
      },
    ],
    "permissions.list": [
      {
        kind: "drive",
        parameter: "driveId",
      },
      {
        kind: "drive-item",
        parameter: "itemId",
      },
    ],
    "permissions.create": [
      {
        kind: "drive",
        parameter: "driveId",
      },
      {
        kind: "drive-item",
        parameter: "itemId",
      },
    ],
    "permissions.delete": [
      {
        kind: "drive",
        parameter: "driveId",
      },
      {
        kind: "drive-item",
        parameter: "itemId",
      },
      {
        kind: "permission",
        parameter: "permissionId",
      },
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
