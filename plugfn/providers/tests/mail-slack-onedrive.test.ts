import { describe, it, expect, vi } from "vitest";
import { gmailProvider } from "../src/gmail/index.js";
import { outlookProvider } from "../src/outlook/index.js";
import { slackProvider } from "../src/slack/index.js";
import { onedriveProvider } from "../src/onedrive/index.js";
const response = (data: unknown, status = 200) => ({
  data,
  status,
  headers: {},
});
function context() {
  return {
    provider: {},
    acquireRateLimit: vi.fn(),
    http: Object.fromEntries(
      ["get", "post", "put", "patch", "delete"].map((key) => [key, vi.fn()]),
    ),
  } as any;
}
describe("connected mailbox and file actions", () => {
  it("Gmail binds users/me, exposes cursors and sends once without inventing idempotency", async () => {
    const c = context();
    c.http.get.mockResolvedValue(
      response({ messages: [], nextPageToken: "next" }),
    );
    expect(
      await gmailProvider.actions["messages.list"].execute(
        { pageToken: "before" },
        c,
      ),
    ).toHaveProperty("nextPageToken", "next");
    expect(c.http.get.mock.calls[0][0]).toBe(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages",
    );
    await expect(
      gmailProvider.actions["messages.list"].execute({ userId: "someone" }, c),
    ).rejects.toThrow();
    c.http.post.mockResolvedValue(response({ id: "sent" }));
    await gmailProvider.actions["messages.send"].execute(
      { body: { raw: "aGVsbG8=" } },
      c,
    );
    expect(c.http.post).toHaveBeenCalledTimes(1);
    expect(gmailProvider.actions["messages.send"].contract.retry).toBe("never");
  });
  it("Outlook preserves Graph cursors only for the same mailbox resource", async () => {
    const c = context();
    c.http.get.mockResolvedValue(response({ value: [] }));
    const nextLink =
      "https://graph.microsoft.com/v1.0/me/messages?$skiptoken=opaque";
    await outlookProvider.actions["mail.messages.list"].execute(
      { nextLink },
      c,
    );
    expect(c.http.get.mock.calls[0][0]).toBe(nextLink);
    for (const nextLink of [
      "https://evil.example/x",
      "https://graph.microsoft.com/v1.0/users/other/messages",
      "https://graph.microsoft.com/v1.0/me/events",
    ])
      await expect(
        outlookProvider.actions["mail.messages.list"].execute({ nextLink }, c),
      ).rejects.toThrow();
    expect(c.http.get).toHaveBeenCalledTimes(1);
  });
  it("Outlook reports accepted send and preserves explicit calendar notifications in event fields", async () => {
    const c = context();
    c.http.post.mockResolvedValue(response("", 202));
    expect(
      await outlookProvider.actions["mail.drafts.send"].execute(
        { id: "draft" },
        c,
      ),
    ).toEqual({ success: true });
    expect(c.http.post).toHaveBeenCalledTimes(1);
    c.http.post.mockResolvedValue(response({ id: "event" }, 201));
    await outlookProvider.actions["events.create"].execute(
      {
        calendarId: "cal",
        event: {
          subject: "Test",
          start: {
            dateTime: "2026-09-13T12:00:00",
            timeZone: "India Standard Time",
          },
          end: {
            dateTime: "2026-09-13T13:00:00",
            timeZone: "India Standard Time",
          },
        },
      },
      c,
    );
    expect(c.http.post.mock.calls[1][1].start.timeZone).toBe(
      "India Standard Time",
    );
    expect(outlookProvider.actions["events.create"].contract.retry).toBe(
      "never",
    );
  });
  it("Slack retains cursors and rejects provider HTTP 200 failures", async () => {
    const c = context();
    c.http.get.mockResolvedValue(
      response({
        ok: true,
        messages: [],
        response_metadata: { next_cursor: "next" },
      }),
    );
    expect(
      await slackProvider.actions["conversations.history"].execute(
        { channel: "C1", cursor: "before" },
        c,
      ),
    ).toHaveProperty("response_metadata.next_cursor", "next");
    c.http.post.mockResolvedValue(
      response({ ok: false, error: "missing_scope" }),
    );
    await expect(
      slackProvider.actions["messages.post"].execute(
        { channel: "C1", text: "test" },
        c,
      ),
    ).rejects.toThrow("PROVIDER_ACTION_FAILED");
    expect(c.http.post).toHaveBeenCalledTimes(1);
  });
  it("Slack external upload uses exact bytes, omits credentials and completes once", async () => {
    const c = context();
    c.http.get.mockResolvedValue(
      response({
        ok: true,
        file_id: "F1",
        upload_url: "https://files.slack.com/upload/v1/test",
      }),
    );
    c.http.post
      .mockResolvedValueOnce(response("OK"))
      .mockResolvedValueOnce(response({ ok: true, files: [{ id: "F1" }] }));
    await slackProvider.actions["files.upload"].execute(
      { filename: "a.bin", base64: "AP8=", channel_id: "C1" },
      c,
    );
    expect(Array.from(c.http.post.mock.calls[0][1])).toEqual([0, 255]);
    expect(c.http.post.mock.calls[0][2]).toMatchObject({
      omitAuth: true,
      redirect: "error",
    });
    expect(c.http.post.mock.calls[1][1].files).toEqual([
      { id: "F1", title: undefined },
    ]);
    expect(c.http.post).toHaveBeenCalledTimes(2);
  });
  it("OneDrive refuses untrusted capability hosts without forwarding the token", async () => {
    const c = context();
    c.http.get.mockResolvedValue(
      response({ "@microsoft.graph.downloadUrl": "https://evil.example/file" }),
    );
    await expect(
      onedriveProvider.actions["items.download"].execute(
        { driveId: "d", itemId: "i" },
        c,
      ),
    ).rejects.toThrow("UNTRUSTED");
    expect(c.http.get).toHaveBeenCalledTimes(1);
    c.http.get
      .mockResolvedValueOnce(
        response({
          "@microsoft.graph.downloadUrl": "https://tenant.sharepoint.com/file",
        }),
      )
      .mockResolvedValueOnce(response(new Uint8Array([255]).buffer));
    expect(
      await onedriveProvider.actions["items.download"].execute(
        { driveId: "d", itemId: "i" },
        c,
      ),
    ).toHaveProperty("base64", "/w==");
    expect(c.http.get.mock.calls[2][1]).toMatchObject({
      omitAuth: true,
      redirect: "error",
      maxResponseBytes: 20 * 1024 * 1024,
    });
  });
  it("OneDrive upload never retries a fragment after an uncertain dispatch", async () => {
    const c = context();
    c.http.post.mockResolvedValue(
      response({ uploadUrl: "https://tenant.sharepoint.com/upload" }),
    );
    c.http.put.mockRejectedValue(new Error("timeout after dispatch"));
    await expect(
      onedriveProvider.actions["items.upload"].execute(
        { driveId: "d", parentId: "p", fileName: "a", base64: "YQ==" },
        c,
      ),
    ).rejects.toThrow("timeout");
    expect(c.http.put).toHaveBeenCalledTimes(1);
    expect(c.http.put.mock.calls[0][2]).toMatchObject({
      omitAuth: true,
      headers: { "Content-Range": "bytes 0-0/1" },
    });
  });
});
