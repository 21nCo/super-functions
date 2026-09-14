import { describe, it, expect, vi } from "vitest";
import { connectedMailboxAdapter } from "../src/email/connected-mailbox-adapter";
const mail = {
  from: "me@example.com",
  to: ["recipient@example.com"],
  subject: "Hello ✓",
  text: "Body",
};
describe("connected mailbox adapter", () => {
  it("builds Gmail MIME and binds the sender to the verified mailbox", async () => {
    const dispatch = vi.fn().mockResolvedValue({ id: "sent" });
    const adapter = connectedMailboxAdapter({
      provider: "gmail",
      address: mail.from,
      dispatch,
      isConnected: async () => true,
    });
    expect(
      await adapter.sendEmail({
        ...mail,
        attachments: [{ filename: "a.bin", content: new Uint8Array([0, 255]) }],
      }),
    ).toMatchObject({ success: true, providerMessageId: "sent" });
    const raw = dispatch.mock.calls[0][1].body.raw
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    expect(atob(raw)).toContain("From: me@example.com");
    expect(atob(raw)).toContain("AP8=");
    expect(
      await adapter.sendEmail({ ...mail, from: "other@example.com" }),
    ).toMatchObject({ success: false, error: { retryable: false } });
    expect(dispatch).toHaveBeenCalledTimes(1);
  });
  it("round-trips all byte values across the base64 chunk boundary", async () => {
    const dispatch = vi.fn().mockResolvedValue({ success: true });
    const adapter = connectedMailboxAdapter({
      provider: "outlook",
      address: mail.from,
      dispatch,
      isConnected: async () => true,
    });
    const bytes = Buffer.from(Array.from({ length: 8448 }, (_, i) => i % 256));
    const result = await adapter.sendEmail({
      ...mail,
      attachments: [
        {
          filename: "bytes.bin",
          content: bytes.toString("base64"),
          encoding: "base64",
        },
      ],
    });
    expect(result.success).toBe(true);
    expect(
      Buffer.from(
        dispatch.mock.calls[0][1].message.attachments[0].contentBytes,
        "base64",
      ),
    ).toEqual(bytes);
  });
  it("maps Graph mail and treats acceptance separately from a provider message ID", async () => {
    const dispatch = vi.fn().mockResolvedValue({ success: true });
    const adapter = connectedMailboxAdapter({
      provider: "outlook",
      address: mail.from,
      dispatch,
      isConnected: async () => true,
    });
    const result = await adapter.sendEmail(mail);
    expect(result.success).toBe(true);
    expect(result.providerMessageId).toBeUndefined();
    expect(dispatch).toHaveBeenCalledWith(
      "mail.messages.send",
      expect.objectContaining({
        message: expect.objectContaining({
          toRecipients: [
            { emailAddress: { address: "recipient@example.com" } },
          ],
        }),
      }),
    );
  });
  it("never repeats an uncertain send or logs raw provider errors", async () => {
    const dispatch = vi.fn().mockRejectedValue(new Error("secret content"));
    const adapter = connectedMailboxAdapter({
      provider: "gmail",
      address: mail.from,
      dispatch,
      isConnected: async () => true,
    });
    const result = await adapter.sendEmail(mail);
    expect(result.error?.retryable).toBe(false);
    expect(JSON.stringify(result)).not.toContain("secret content");
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(adapter.capabilities.supportsIdempotency).toBe(false);
  });
});
