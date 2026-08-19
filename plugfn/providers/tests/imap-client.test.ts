import { ImapFlow } from "imapflow";
import { describe, expect, it, vi } from "vitest";
import { ImapClient } from "../src/imap-smtp/imap-client.js";

describe("ImapClient", () => {
  it("passes secure auth config through the mocked IMAP lifecycle", async () => {
    const client = new ImapClient({
      host: "mail.example.com",
      username: "user@example.com",
      password: "secret",
      tls: true,
    });

    await expect(client.connect()).resolves.toMatchObject({
      imapConnected: true,
      host: "mail.example.com",
      port: 993,
      tls: true,
    });

    expect(ImapFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "mail.example.com",
        port: 993,
        secure: true,
        auth: { user: "user@example.com", pass: "secret" },
        verifyOnly: true,
      }),
    );
    const transport = vi.mocked(ImapFlow).mock.results.at(-1)?.value;
    expect(transport?.connect).toHaveBeenCalledTimes(1);
    expect(transport?.close).toHaveBeenCalledTimes(1);
  });

  it("defaults insecure IMAP connections to port 143", async () => {
    const client = new ImapClient({
      host: "mail.example.com",
      username: "user@example.com",
      password: "secret",
      tls: false,
      explicitInsecureOverride: true,
    });

    await expect(client.connect()).resolves.toMatchObject({
      port: 143,
      tls: false,
    });

    expect(ImapFlow).toHaveBeenLastCalledWith(
      expect.objectContaining({
        port: 143,
        secure: false,
      }),
    );
  });

  it("does not report success when IMAP authentication fails", async () => {
    vi.mocked(ImapFlow).mockImplementationOnce(function FailingImapFlow() {
      return {
        connect: vi.fn().mockRejectedValue(new Error("authentication failed")),
        close: vi.fn(),
      } as unknown as ImapFlow;
    });
    const client = new ImapClient({
      host: "mail.example.com",
      username: "user@example.com",
      password: "wrong",
    });

    await expect(client.connect()).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: "imap connection or authentication failed",
    });
  });

  it("uses an access token for OAuth-backed IMAP accounts", async () => {
    const client = new ImapClient({
      host: "imap.mail.yahoo.com",
      username: "user@yahoo.com",
      password: "oauth-token",
      oauth2: true,
    });

    await client.connect();

    expect(ImapFlow).toHaveBeenLastCalledWith(
      expect.objectContaining({
        auth: { user: "user@yahoo.com", accessToken: "oauth-token" },
      }),
    );
  });
});
