import { mkdirSync, writeFileSync } from "node:fs";
import * as p from "../../plugfn/providers/dist/index.js";
import { createActionManifest } from "../../plugfn/core/dist/index.js";
import { zodToJsonSchema } from "zod-to-json-schema";
const selected = {
  githubProvider:
    "repos.list issues.list issues.get issues.create issues.update issues.comments.list issues.comments.create pulls.list pulls.get pulls.create pulls.review",
  linearProvider:
    "teams.list issues.search issues.list issues.get issues.create issues.update comments.list comments.create documents.list documents.get",
  notionProvider:
    "search pages.get pages.create pages.update blocks.children.list blocks.children.append dataSources.list dataSources.query",
  clickupProvider:
    "spaces.list lists.list tasks.list tasks.get tasks.create tasks.update comments.list comments.create",
  slackUserProvider:
    "conversations.list conversations.history conversations.replies search.messages users.info messages.post messages.update files.upload",
  gmailProvider:
    "messages.list messages.get threads.get attachments.get labels.list messages.modify drafts.create drafts.update drafts.send messages.send",
  googleDriveProvider:
    "files.search files.get files.download files.export files.create files.update permissions.list permissions.create permissions.delete",
  googleDocsProvider: "documents.get documents.create documents.batchUpdate",
  googleSheetsProvider:
    "spreadsheets.get spreadsheets.create values.get values.batchGet values.update values.append spreadsheets.batchUpdate",
  googleCalendarProvider:
    "calendars.list events.list events.get events.create events.update events.delete freebusy.query",
  jiraProvider:
    "sites.list projects.list issues.search issues.get issues.create issues.update comments.list comments.create transitions.list transitions.apply",
  outlookProvider:
    "mail.messages.list mail.messages.get mail.attachments.get mail.drafts.create mail.drafts.send mail.messages.send calendars.list events.list events.get events.create events.update events.delete",
  onedriveProvider:
    "drives.list items.search items.get items.download items.upload permissions.list permissions.create permissions.delete",
};
const manifests = [];
for (const [exportName, names] of Object.entries(selected)) {
  const provider = p[exportName];
  if (!provider) throw new Error(`Provider export missing: ${exportName}`);
  for (const name of names.split(" ")) {
    const action = provider.actions[name];
    if (!action || !action.contract)
      throw new Error(`Action/contract missing: ${exportName}.${name}`);
    manifests.push({
      ...(await createActionManifest(provider.name, action, {
        input: zodToJsonSchema(action.parameters),
        output: zodToJsonSchema(action.returns),
      })),
      qualification: "pending-full-action-and-sandbox-matrix",
      sandbox: "not-run",
      exportName,
    });
  }
}
mkdirSync(".conduct/SFNS-4", { recursive: true });
writeFileSync(
  ".conduct/SFNS-4/action-manifests.json",
  JSON.stringify(manifests, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    actions: manifests.length,
    providers: Object.keys(selected).length,
    liveQualified: 0,
  }),
);
