import { z } from "zod";
import type { Action } from "plugfn";
import { restAction, jsonObject, remoteId } from "../shared/rest-action.js";
const base = "https://slack.com/api";
const cursor = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(200).optional(),
});
const ok = z.object({ ok: z.literal(true) }).passthrough();
const message = z
  .object({
    channel: remoteId,
    text: z.string().min(1),
    blocks: z.array(jsonObject).optional(),
    thread_ts: z.string().optional(),
    unfurl_links: z.boolean().optional(),
    unfurl_media: z.boolean().optional(),
  })
  .strict();
function action(
  name: string,
  parameters: z.ZodTypeAny,
  returns: z.ZodTypeAny,
  scopes: string[],
  read = true,
  paginated = false,
): Action {
  return restAction({
    name,
    method: read ? "GET" : "POST",
    path: () => `${base}/${name}`,
    parameters,
    returns,
    scopes,
    query: read ? (p) => p : undefined,
    body: read ? undefined : (p) => p,
    pagination: paginated
      ? { kind: "cursor", cursorParameter: "cursor", maxPageSize: 200 }
      : { kind: "none" },
  });
}
export const slackActions: Record<string, Action> = {
  "conversations.list": action(
    "conversations.list",
    cursor
      .extend({
        types: z.string().optional(),
        exclude_archived: z.boolean().optional(),
      })
      .strict(),
    ok.extend({ channels: z.array(jsonObject) }),
    ["channels:read"],
    true,
    true,
  ),
  "conversations.history": action(
    "conversations.history",
    cursor
      .extend({
        channel: remoteId,
        oldest: z.string().optional(),
        latest: z.string().optional(),
        inclusive: z.boolean().optional(),
      })
      .strict(),
    ok.extend({ messages: z.array(jsonObject) }),
    ["channels:history"],
    true,
    true,
  ),
  "conversations.replies": action(
    "conversations.replies",
    cursor
      .extend({
        channel: remoteId,
        ts: z.string().min(1),
        oldest: z.string().optional(),
        latest: z.string().optional(),
        inclusive: z.boolean().optional(),
      })
      .strict(),
    ok.extend({ messages: z.array(jsonObject) }),
    ["channels:history"],
    true,
    true,
  ),
  "search.messages": action(
    "search.messages",
    z
      .object({
        query: z.string().min(1),
        count: z.number().int().min(1).max(100).optional(),
        page: z.number().int().min(1).optional(),
        sort: z.enum(["score", "timestamp"]).optional(),
        sort_dir: z.enum(["asc", "desc"]).optional(),
      })
      .strict(),
    ok.extend({
      messages: z
        .object({
          matches: z.array(jsonObject),
          paging: jsonObject.optional(),
          pagination: jsonObject.optional(),
        })
        .passthrough(),
    }),
    ["search:read"],
  ),
  "users.info": action(
    "users.info",
    z.object({ user: remoteId }).strict(),
    ok.extend({ user: z.object({ id: z.string() }).passthrough() }),
    ["users:read"],
  ),
  "messages.post": action(
    "chat.postMessage",
    message,
    ok.extend({ channel: z.string(), ts: z.string() }),
    ["chat:write"],
    false,
  ),
  "messages.update": action(
    "chat.update",
    message
      .omit({ thread_ts: true })
      .extend({ ts: z.string().min(1) })
      .strict(),
    ok.extend({ channel: z.string(), ts: z.string() }),
    ["chat:write"],
    false,
  ),
};
slackActions["messages.post"].name = "messages.post";
slackActions["messages.update"].name = "messages.update";
slackActions["search.messages"].contract!.pagination = {
  kind: "page",
  maxPageSize: 100,
};
slackActions["chat.postMessage"] = {
  ...slackActions["messages.post"],
  name: "chat.postMessage",
};
const upload = z
  .object({
    filename: z.string().min(1).max(255),
    base64: z.string().max(28 * 1024 * 1024),
    channel_id: remoteId.optional(),
    title: z.string().optional(),
    initial_comment: z.string().optional(),
    thread_ts: z.string().optional(),
  })
  .strict();
slackActions["files.upload"] = {
  name: "files.upload",
  displayName: "Upload file",
  description: "Upload up to 20 MiB using Slack external upload and completion",
  parameters: upload,
  returns: ok.extend({ files: z.array(jsonObject) }),
  contract: {
    version: "1.0.0",
    effect: "write",
    requiredScopes: ["files:write"],
    resources: [{ kind: "channel", parameter: "channel_id" }],
    sensitiveKeys: ["base64", "initial_comment", "upload_url"],
    pagination: { kind: "none" },
    retry: "never",
  },
  async execute(input, context) {
    const p = upload.parse(input);
    const bytes = Uint8Array.from(atob(p.base64), (c) => c.charCodeAt(0));
    if (!bytes.length || bytes.length > 20 * 1024 * 1024)
      throw new Error("SLACK_UPLOAD_SIZE_LIMIT");
    const session = await context.http.get(
      `${base}/files.getUploadURLExternal`,
      {
        params: { filename: p.filename, length: bytes.length },
        redirect: "error",
      },
    );
    const info = z
      .object({
        ok: z.literal(true),
        file_id: z.string(),
        upload_url: z.string().url(),
      })
      .parse(session.data);
    const target = new URL(info.upload_url);
    if (
      target.protocol !== "https:" ||
      target.hostname !== "files.slack.com" ||
      target.username ||
      target.password ||
      target.port
    )
      throw new Error("SLACK_UPLOAD_URL_INVALID");
    await context.http.post(target.toString(), bytes, {
      omitAuth: true,
      bodyEncoding: "raw",
      redirect: "error",
      headers: { "Content-Type": "application/octet-stream" },
    });
    const result = await context.http.post(
      `${base}/files.completeUploadExternal`,
      {
        files: [{ id: info.file_id, title: p.title }],
        channel_id: p.channel_id,
        initial_comment: p.initial_comment,
        thread_ts: p.thread_ts,
      },
      { redirect: "error" },
    );
    return ok.extend({ files: z.array(jsonObject) }).parse(result.data);
  },
};
