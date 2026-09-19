import { describe, expect, it, vi } from "vitest";
import { googleDriveProvider } from "../src/google-drive/index.js";
import { googleDocsProvider } from "../src/google-docs/index.js";
import { googleSheetsProvider } from "../src/google-sheets/index.js";
import { googleCalendarProvider } from "../src/google-calendar/index.js";
import { jiraProvider } from "../src/jira/index.js";
const context = (data: unknown, status = 200) =>
  ({
    userId: "u1",
    connectionId: "c1",
    connectionMetadata: { cloudId: "site1" },
    provider: { name: "test", baseUrl: "https://example.test" },
    auth: { type: "oauth2", credentials: {} },
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    http: Object.fromEntries(
      ["get", "post", "put", "patch", "delete"].map((method) => [
        method,
        vi.fn().mockResolvedValue({
          data,
          status,
          headers: { "content-type": "application/octet-stream" },
        }),
      ]),
    ),
  }) as any;
describe("selected provider wire contracts", () => {
  it("retains Drive cursors and requests content rather than returning a link", async () => {
    const c = context({
      files: [{ id: "f1", name: "file" }],
      nextPageToken: "cursor",
    });
    const result = await googleDriveProvider.actions["files.search"].execute(
      { q: "trashed=false", pageToken: "previous", pageSize: 10 },
      c,
    );
    expect(result.nextPageToken).toBe("cursor");
    expect(c.http.get).toHaveBeenCalledWith(
      "https://www.googleapis.com/drive/v3/files",
      expect.objectContaining({
        params: { q: "trashed=false", pageToken: "previous", pageSize: 10 },
      }),
    );
    const bytes = Uint8Array.from({ length: 8448 }, (_, i) => i % 256);
    const binary = context(bytes.buffer);
    expect(
      await googleDriveProvider.actions["files.download"].execute(
        { fileId: "f1" },
        binary,
      ),
    ).toEqual({
      base64: Buffer.from(bytes).toString("base64"),
      mimeType: "application/octet-stream",
      byteLength: bytes.length,
    });
    expect(binary.http.get.mock.calls[0][1]).toMatchObject({
      responseType: "arrayBuffer",
      params: { alt: "media" },
    });
  });
  it("sends Drive metadata and binary upload without corrupting bytes", async () => {
    const c = context({ id: "new-file" });
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
    await googleDriveProvider.actions["files.create"].execute(
      {
        body: { name: "test.bin" },
        media: {
          base64: Buffer.from(bytes).toString("base64"),
          mimeType: "application/octet-stream",
        },
      },
      c,
    );
    const [url, payload, config] = c.http.post.mock.calls[0];
    expect(url).toBe("https://www.googleapis.com/upload/drive/v3/files");
    expect(config.params.uploadType).toBe("multipart");
    expect(Buffer.from(payload).includes(Buffer.from(bytes))).toBe(true);
  });
  it("builds Drive uploads without relying on global Web Crypto", async () => {
    const c = context({ id: "new-file" });
    vi.stubGlobal("crypto", undefined);
    try {
      await expect(
        googleDriveProvider.actions["files.create"].execute(
          {
            body: { name: "test.txt" },
            media: {
              base64: Buffer.from("content").toString("base64"),
              mimeType: "text/plain",
            },
          },
          c,
        ),
      ).resolves.toEqual({ id: "new-file" });
      expect(c.http.post).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("retains revision-aware Docs edits and rejects invalid path types before effects", async () => {
    const c = context({ documentId: "doc", replies: [] });
    const input = {
      documentId: "doc",
      body: {
        writeControl: { requiredRevisionId: "revision" },
        requests: [{ insertText: { text: "hello", endOfSegmentLocation: {} } }],
      },
    };
    await googleDocsProvider.actions["documents.batchUpdate"].execute(input, c);
    expect(c.http.post.mock.calls[0]).toEqual([
      "https://docs.googleapis.com/v1/documents/doc:batchUpdate",
      input.body,
      expect.any(Object),
    ]);
    await expect(
      googleDocsProvider.actions["documents.get"].execute(
        { documentId: 12 },
        c,
      ),
    ).rejects.toThrow();
    expect(c.http.get).not.toHaveBeenCalled();
  });
  it("encodes A1 ranges and preserves Sheets input options", async () => {
    const c = context({ spreadsheetId: "s1", updatedRange: "'A B'!A1" });
    await googleSheetsProvider.actions["values.update"].execute(
      {
        spreadsheetId: "s1",
        range: "'A B'!A1",
        valueInputOption: "USER_ENTERED",
        body: { values: [["=1+1"]] },
      },
      c,
    );
    expect(c.http.put.mock.calls[0][0]).toContain(
      encodeURIComponent("'A B'!A1"),
    );
    expect(c.http.put.mock.calls[0][2].params.valueInputOption).toBe(
      "USER_ENTERED",
    );
  });
  it("preserves Calendar notification effects and timezone data", async () => {
    const c = context({ id: "event" });
    const body = {
      summary: "test",
      start: {
        dateTime: "2026-09-13T12:00:00+05:30",
        timeZone: "Asia/Kolkata",
      },
      end: { dateTime: "2026-09-13T13:00:00+05:30" },
    };
    await googleCalendarProvider.actions["events.create"].execute(
      { calendarId: "primary", sendUpdates: "none", body },
      c,
    );
    expect(c.http.post.mock.calls[0][1]).toEqual(body);
    expect(googleCalendarProvider.actions["events.create"].contract.retry).toBe(
      "never",
    );
  });
  it("binds Jira site to connection metadata and uses enhanced JQL pagination", async () => {
    const c = context({ issues: [], nextPageToken: "next" });
    await jiraProvider.actions["issues.search"].execute(
      { jql: "project = TEST", nextPageToken: "prev" },
      c,
    );
    expect(c.http.post.mock.calls[0][0]).toBe(
      "https://api.atlassian.com/ex/jira/site1/rest/api/3/search/jql",
    );
    await expect(
      jiraProvider.actions["issues.search"].execute(
        { jql: "x", cloudId: "other" },
        c,
      ),
    ).rejects.toThrow();
    expect(c.http.post).toHaveBeenCalledTimes(1);
    c.connectionMetadata = {};
    await expect(
      jiraProvider.actions["issues.search"].execute({ jql: "x" }, c),
    ).rejects.toThrow("SITE_REQUIRED");
  });
  it("rejects malformed provider responses and propagates provider failures without retrying writes", async () => {
    const c = context("invalid");
    await expect(
      jiraProvider.actions["issues.get"].execute({ issueIdOrKey: "TEST-1" }, c),
    ).rejects.toThrow();
    c.http.post.mockRejectedValue(new Error("HTTP 429"));
    await expect(
      googleDocsProvider.actions["documents.create"].execute(
        { body: { title: "test" } },
        c,
      ),
    ).rejects.toThrow("429");
    expect(c.http.post).toHaveBeenCalledTimes(1);
  });
});
