import { describe, it, expect, vi } from "vitest";
import * as providers from "../src/index.js";
import { resolveActionContract } from "plugfn";
// Expected paths and fixtures are explicit API examples, independent of generated Discovery mappings.
type Case = [
  string,
  string,
  Record<string, unknown>,
  unknown,
  string,
  string,
  number?,
];
const cases: Case[] = [
  [
    "gmailProvider",
    "messages.get",
    { id: "m" },
    { id: "m" },
    "get",
    "/gmail/v1/users/me/messages/m",
  ],
  [
    "gmailProvider",
    "threads.get",
    { id: "t" },
    { id: "t", messages: [] },
    "get",
    "/gmail/v1/users/me/threads/t",
  ],
  [
    "gmailProvider",
    "attachments.get",
    { messageId: "m", id: "a" },
    { size: 1, data: "YQ" },
    "get",
    "/gmail/v1/users/me/messages/m/attachments/a",
  ],
  [
    "gmailProvider",
    "labels.list",
    {},
    { labels: [] },
    "get",
    "/gmail/v1/users/me/labels",
  ],
  [
    "gmailProvider",
    "messages.modify",
    { id: "m", body: { addLabelIds: ["STARRED"] } },
    { id: "m" },
    "post",
    "/gmail/v1/users/me/messages/m/modify",
  ],
  [
    "gmailProvider",
    "drafts.create",
    { body: { message: { raw: "YQ" } } },
    { id: "d", message: { id: "m" } },
    "post",
    "/gmail/v1/users/me/drafts",
  ],
  [
    "gmailProvider",
    "drafts.update",
    { id: "d", body: { message: { raw: "Yg" } } },
    { id: "d" },
    "put",
    "/gmail/v1/users/me/drafts/d",
  ],
  [
    "gmailProvider",
    "drafts.send",
    { body: { id: "d" } },
    { id: "m" },
    "post",
    "/gmail/v1/users/me/drafts/send",
  ],
  [
    "googleDriveProvider",
    "files.get",
    { fileId: "f" },
    { id: "f", name: "file" },
    "get",
    "/drive/v3/files/f",
  ],
  [
    "googleDriveProvider",
    "files.export",
    { fileId: "f", mimeType: "text/plain" },
    new Uint8Array([65]).buffer,
    "get",
    "/drive/v3/files/f/export",
  ],
  [
    "googleDriveProvider",
    "files.update",
    { fileId: "f", body: { name: "renamed" } },
    { id: "f" },
    "patch",
    "/drive/v3/files/f",
  ],
  [
    "googleDriveProvider",
    "permissions.list",
    { fileId: "f" },
    { permissions: [], nextPageToken: "next" },
    "get",
    "/drive/v3/files/f/permissions",
  ],
  [
    "googleDriveProvider",
    "permissions.create",
    {
      fileId: "f",
      body: { type: "user", role: "reader", emailAddress: "test@example.com" },
    },
    { id: "p" },
    "post",
    "/drive/v3/files/f/permissions",
  ],
  [
    "googleDriveProvider",
    "permissions.delete",
    { fileId: "f", permissionId: "p" },
    null,
    "delete",
    "/drive/v3/files/f/permissions/p",
    204,
  ],
  [
    "googleSheetsProvider",
    "spreadsheets.get",
    { spreadsheetId: "s" },
    { spreadsheetId: "s" },
    "get",
    "/v4/spreadsheets/s",
  ],
  [
    "googleSheetsProvider",
    "spreadsheets.create",
    { body: { properties: { title: "Test" } } },
    { spreadsheetId: "s" },
    "post",
    "/v4/spreadsheets",
  ],
  [
    "googleSheetsProvider",
    "values.get",
    { spreadsheetId: "s", range: "A1" },
    { range: "A1", values: [["x"]] },
    "get",
    "/v4/spreadsheets/s/values/A1",
  ],
  [
    "googleSheetsProvider",
    "values.batchGet",
    { spreadsheetId: "s", ranges: ["A1", "B1"] },
    { spreadsheetId: "s", valueRanges: [] },
    "get",
    "/v4/spreadsheets/s/values:batchGet",
  ],
  [
    "googleSheetsProvider",
    "values.append",
    {
      spreadsheetId: "s",
      range: "A1",
      valueInputOption: "RAW",
      body: { values: [["x"]] },
    },
    { spreadsheetId: "s" },
    "post",
    "/v4/spreadsheets/s/values/A1:append",
  ],
  [
    "googleSheetsProvider",
    "spreadsheets.batchUpdate",
    {
      spreadsheetId: "s",
      body: { requests: [{ addSheet: { properties: { title: "New" } } }] },
    },
    { spreadsheetId: "s", replies: [] },
    "post",
    "/v4/spreadsheets/s:batchUpdate",
  ],
  [
    "googleCalendarProvider",
    "calendars.list",
    {},
    { items: [], nextPageToken: "next" },
    "get",
    "/calendar/v3/users/me/calendarList",
  ],
  [
    "googleCalendarProvider",
    "events.list",
    { calendarId: "primary" },
    { items: [], nextPageToken: "next" },
    "get",
    "/calendar/v3/calendars/primary/events",
  ],
  [
    "googleCalendarProvider",
    "events.get",
    { calendarId: "primary", eventId: "e" },
    { id: "e" },
    "get",
    "/calendar/v3/calendars/primary/events/e",
  ],
  [
    "googleCalendarProvider",
    "events.update",
    { calendarId: "primary", eventId: "e", body: { summary: "Changed" } },
    { id: "e" },
    "put",
    "/calendar/v3/calendars/primary/events/e",
  ],
  [
    "googleCalendarProvider",
    "events.delete",
    { calendarId: "primary", eventId: "e" },
    null,
    "delete",
    "/calendar/v3/calendars/primary/events/e",
    204,
  ],
  [
    "googleCalendarProvider",
    "freebusy.query",
    {
      body: {
        timeMin: "2026-09-13T00:00:00Z",
        timeMax: "2026-09-14T00:00:00Z",
        items: [{ id: "primary" }],
      },
    },
    { calendars: {} },
    "post",
    "/calendar/v3/freeBusy",
  ],
  [
    "jiraProvider",
    "sites.list",
    {},
    [
      {
        id: "site",
        url: "https://test.atlassian.net",
        scopes: ["read:jira-work"],
      },
    ],
    "get",
    "/oauth/token/accessible-resources",
  ],
  [
    "jiraProvider",
    "projects.list",
    { startAt: 0 },
    { values: [], isLast: true },
    "get",
    "/ex/jira/site/rest/api/3/project/search",
  ],
  [
    "jiraProvider",
    "transitions.list",
    { issueIdOrKey: "TEST-1" },
    { transitions: [] },
    "get",
    "/ex/jira/site/rest/api/3/issue/TEST-1/transitions",
  ],
  [
    "jiraProvider",
    "transitions.apply",
    { issueIdOrKey: "TEST-1", transitionId: "2" },
    null,
    "post",
    "/ex/jira/site/rest/api/3/issue/TEST-1/transitions",
    204,
  ],
  [
    "outlookProvider",
    "mail.messages.get",
    { id: "m" },
    { id: "m" },
    "get",
    "/v1.0/me/messages/m",
  ],
  [
    "outlookProvider",
    "mail.attachments.get",
    { id: "m", attachmentId: "a" },
    {
      id: "a",
      "@odata.type": "#microsoft.graph.fileAttachment",
      contentBytes: "YQ==",
    },
    "get",
    "/v1.0/me/messages/m/attachments/a",
  ],
  [
    "outlookProvider",
    "mail.drafts.create",
    {
      message: {
        subject: "Test",
        body: { contentType: "Text", content: "Body" },
        toRecipients: [{ emailAddress: { address: "test@example.com" } }],
      },
    },
    { id: "d" },
    "post",
    "/v1.0/me/messages",
    201,
  ],
  [
    "outlookProvider",
    "mail.messages.send",
    {
      message: {
        subject: "Test",
        body: { contentType: "Text", content: "Body" },
        toRecipients: [{ emailAddress: { address: "test@example.com" } }],
      },
    },
    null,
    "post",
    "/v1.0/me/sendMail",
    202,
  ],
  [
    "outlookProvider",
    "calendars.list",
    {},
    { value: [] },
    "get",
    "/v1.0/me/calendars",
  ],
  [
    "outlookProvider",
    "events.list",
    { calendarId: "c" },
    { value: [] },
    "get",
    "/v1.0/me/calendars/c/events",
  ],
  [
    "outlookProvider",
    "events.get",
    { id: "e" },
    { id: "e" },
    "get",
    "/v1.0/me/events/e",
  ],
  [
    "outlookProvider",
    "events.update",
    { id: "e", event: { subject: "Changed" } },
    { id: "e" },
    "patch",
    "/v1.0/me/events/e",
  ],
  [
    "outlookProvider",
    "events.delete",
    { id: "e" },
    null,
    "delete",
    "/v1.0/me/events/e",
    204,
  ],
  [
    "onedriveProvider",
    "drives.list",
    {},
    { value: [] },
    "get",
    "/v1.0/me/drives",
  ],
  [
    "onedriveProvider",
    "items.search",
    { driveId: "d", q: "report" },
    { value: [] },
    "get",
    "/v1.0/drives/d/root/search(q='report')",
  ],
  [
    "onedriveProvider",
    "items.get",
    { driveId: "d", itemId: "i" },
    { id: "i", name: "file" },
    "get",
    "/v1.0/drives/d/items/i",
  ],
  [
    "onedriveProvider",
    "permissions.list",
    { driveId: "d", itemId: "i" },
    { value: [] },
    "get",
    "/v1.0/drives/d/items/i/permissions",
  ],
  [
    "onedriveProvider",
    "permissions.create",
    {
      driveId: "d",
      itemId: "i",
      recipients: [{ email: "test@example.com" }],
      roles: ["read"],
    },
    { value: [] },
    "post",
    "/v1.0/drives/d/items/i/invite",
  ],
  [
    "onedriveProvider",
    "permissions.delete",
    { driveId: "d", itemId: "i", permissionId: "p" },
    null,
    "delete",
    "/v1.0/drives/d/items/i/permissions/p",
    204,
  ],
  [
    "slackUserProvider",
    "conversations.replies",
    { channel: "C1", ts: "1.0" },
    { ok: true, messages: [], has_more: false },
    "get",
    "/api/conversations.replies",
  ],
  [
    "slackUserProvider",
    "search.messages",
    { query: "from:me", page: 2 },
    { ok: true, messages: { matches: [], paging: { page: 2, pages: 2 } } },
    "get",
    "/api/search.messages",
  ],
  [
    "slackUserProvider",
    "messages.update",
    { channel: "C1", ts: "1.0", text: "Changed" },
    { ok: true, channel: "C1", ts: "1.0" },
    "post",
    "/api/chat.update",
  ],
  [
    "clickupProvider",
    "lists.list",
    { spaceId: "s" },
    { lists: [] },
    "get",
    "/api/v2/space/s/list",
  ],
  [
    "githubProvider",
    "pulls.get",
    { owner: "o", repo: "r", pullNumber: 1 },
    { id: 1, number: 1, title: "Test", body: null },
    "get",
    "/repos/o/r/pulls/1",
  ],
  [
    "githubProvider",
    "issues.comments.create",
    { owner: "o", repo: "r", issueNumber: 1, body: "Comment" },
    {
      id: 1,
      body: "Comment",
      html_url: "https://github.com/o/r/issues/1",
      created_at: "2026-09-13T00:00:00Z",
    },
    "post",
    "/repos/o/r/issues/1/comments",
  ],
  [
    "githubProvider",
    "pulls.review",
    { owner: "o", repo: "r", pullNumber: 1, body: "Review", event: "COMMENT" },
    {
      id: 1,
      body: "Review",
      state: "COMMENTED",
      html_url: "https://github.com/o/r/pull/1",
    },
    "post",
    "/repos/o/r/pulls/1/reviews",
  ],
];
describe.each(cases)(
  "%s %s wire contract",
  (exportName, name, input, data, method, path, status = 200) => {
    const provider = (providers as any)[exportName];
    const action = provider.actions[name];
    function context(failure?: Error) {
      return {
        userId: "user",
        connectionId: "selected",
        connectionMetadata: { cloudId: "site" },
        provider,
        http: Object.fromEntries(
          ["get", "post", "put", "patch", "delete"].map((key) => [
            key,
            failure
              ? vi.fn().mockRejectedValue(failure)
              : vi
                  .fn()
                  .mockResolvedValue({
                    data,
                    status,
                    headers: { "content-type": "text/plain" },
                  }),
          ]),
        ),
      } as any;
    }
    it("validates and dispatches the reviewed request and parses its result", async () => {
      const c = context();
      const result = await action.execute(action.parameters.parse(input), c);
      action.returns.parse(result);
      expect(c.http[method]).toHaveBeenCalledTimes(1);
      expect(new URL(c.http[method].mock.calls[0][0]).pathname).toBe(path);
      expect(resolveActionContract(action).effect).not.toBe("unknown");
      expect(action.parameters.safeParse(null).success).toBe(false);
    });
    it("propagates denied credentials without swallowing failure or duplicating dispatch", async () => {
      const denied = Object.assign(new Error("provider denied credential"), {
        status: 403,
      });
      const c = context(denied);
      await expect(
        action.execute(action.parameters.parse(input), c),
      ).rejects.toThrow("denied");
      expect(c.http[method]).toHaveBeenCalledTimes(1);
    });
  },
);
it("resumes GitHub pages and Linear cursors from the caller checkpoint", async () => {
  const get = vi.fn().mockResolvedValue({ data: [], status: 200, headers: {} });
  await providers.githubProvider.actions["repos.list"].execute(
    { startPage: 4, maxPages: 1 },
    { provider: providers.githubProvider, http: { get } } as any,
  );
  expect(get.mock.calls[0][1].params.page).toBe(4);
  const post = vi
    .fn()
    .mockResolvedValue({
      data: {
        data: {
          teams: {
            nodes: [],
            pageInfo: { hasNextPage: true, endCursor: "next" },
          },
        },
      },
    });
  const result = await providers.linearProvider.actions["teams.list"].execute(
    { after: "before", first: 5 },
    { provider: providers.linearProvider, http: { post } } as any,
  );
  expect(post.mock.calls[0][1].variables.after).toBe("before");
  expect(result.pageInfo.endCursor).toBe("next");
});
