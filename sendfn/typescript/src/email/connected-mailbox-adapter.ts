import type {
  EmailProvider,
  SendEmailRequest,
  SendEmailResponse,
} from "./provider";
import { isBareEmail } from "./address";
import { assertCustomEmailHeaders } from "./headers";

export interface ConnectedMailboxOptions {
  provider: "gmail" | "outlook";
  /** Verified address of the connection. Never take this identity from a tool argument. */
  address: string;
  /** Bound to one authorized connection by the host; throws on unsuccessful execution. */
  dispatch(
    action: "messages.send" | "mail.messages.send",
    input: Record<string, unknown>,
  ): Promise<unknown>;
  /** Check the bound connection's current readiness without sending a message. */
  isConnected(): Promise<boolean>;
}

/** Compose this adapter with EmailService so suppression, audit and claims remain SendFn-owned. */
export function connectedMailboxAdapter(
  options: ConnectedMailboxOptions,
): EmailProvider {
  if (!isBareEmail(options.address))
    throw new Error("SENDFN_MAILBOX_ADDRESS_INVALID");
  const sendEmail = async (
    request: SendEmailRequest,
  ): Promise<SendEmailResponse> => {
    try {
      const from = request.from.match(/<([^<>]+)>$/)?.[1] ?? request.from;
      if (
        /[\r\n]/.test(request.from) ||
        from.toLowerCase() !== options.address.toLowerCase()
      )
        throw new Error("SENDFN_MAILBOX_SENDER_MISMATCH");
      const recipients = [
        ...request.to,
        ...(request.cc ?? []),
        ...(request.bcc ?? []),
      ];
      if (
        !recipients.length ||
        recipients.length > 50 ||
        recipients.some((value) => !isBareEmail(value)) ||
        (request.replyTo && !isBareEmail(request.replyTo))
      )
        throw new Error("SENDFN_MAILBOX_RECIPIENTS_INVALID");
      if (/[\r\n]/.test(request.subject))
        throw new Error("SENDFN_MAILBOX_SUBJECT_INVALID");
      if (!request.text && !request.html)
        throw new Error("SENDFN_MAILBOX_CONTENT_REQUIRED");
      assertCustomEmailHeaders(request.headers);
      const attachments = (request.attachments ?? []).map((file) => {
        if (
          !file.filename ||
          /[\r\n]/.test(file.filename) ||
          (file.encoding &&
            !["base64", "utf8", "utf-8"].includes(file.encoding))
        )
          throw new Error("SENDFN_MAILBOX_ATTACHMENT_INVALID");
        const bytes =
          typeof file.content === "string"
            ? file.encoding === "base64"
              ? Uint8Array.from(atob(file.content), (c) => c.charCodeAt(0))
              : new TextEncoder().encode(file.content)
            : file.content;
        const type = file.contentType ?? "application/octet-stream";
        if (!/^[\w!#$&^_.+-]+\/[\w!#$&^_.+-]+$/.test(type))
          throw new Error("SENDFN_MAILBOX_ATTACHMENT_TYPE_INVALID");
        return { filename: file.filename, bytes, type };
      });
      // Conservative Graph JSON limit, shared by both transports for portable behavior.
      if (
        attachments.reduce((total, file) => total + file.bytes.length, 0) >
        2 * 1024 * 1024
      )
        throw new Error("SENDFN_MAILBOX_ATTACHMENT_LIMIT");
      let result: any;
      if (options.provider === "outlook") {
        const recipient = (address: string) => ({ emailAddress: { address } });
        const headers = Object.entries(request.headers ?? {});
        if (headers.some(([name]) => !name.toLowerCase().startsWith("x-")))
          throw new Error("SENDFN_MAILBOX_HEADER_UNSUPPORTED");
        result = await options.dispatch("mail.messages.send", {
          message: {
            subject: request.subject,
            body: {
              contentType: request.html ? "HTML" : "Text",
              content: request.html ?? request.text,
            },
            toRecipients: request.to.map(recipient),
            ccRecipients: request.cc?.map(recipient),
            bccRecipients: request.bcc?.map(recipient),
            replyTo: request.replyTo ? [recipient(request.replyTo)] : undefined,
            attachments: attachments.map((file) => ({
              "@odata.type": "#microsoft.graph.fileAttachment",
              name: file.filename,
              contentType: file.type,
              contentBytes: base64(file.bytes),
            })),
            ...(headers.length
              ? {
                  internetMessageHeaders: headers.map(([name, value]) => ({
                    name,
                    value,
                  })),
                }
              : {}),
          },
          saveToSentItems: true,
        });
        if (!result || result.success !== true)
          throw new Error("SENDFN_MAILBOX_DISPATCH_UNCONFIRMED");
      } else {
        const boundary = `sendfn-${crypto.randomUUID()}`;
        const headers = [
          `From: ${options.address}`,
          `To: ${request.to.join(", ")}`,
          ...(request.cc?.length ? [`Cc: ${request.cc.join(", ")}`] : []),
          ...(request.bcc?.length ? [`Bcc: ${request.bcc.join(", ")}`] : []),
          ...(request.replyTo ? [`Reply-To: ${request.replyTo}`] : []),
          `Subject: =?UTF-8?B?${base64(new TextEncoder().encode(request.subject))}?=`,
          "MIME-Version: 1.0",
          `Content-Type: multipart/mixed; boundary="${boundary}"`,
          ...Object.entries(request.headers ?? {}).map(
            ([key, value]) => `${key}: ${value}`,
          ),
        ];
        const parts: string[] = [];
        const body = `Content-Type: ${request.html ? "text/html" : "text/plain"}; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${fold(base64(new TextEncoder().encode(request.html ?? request.text!)))}`;
        parts.push(body);
        for (const file of attachments)
          parts.push(
            `Content-Type: ${file.type}\r\nContent-Disposition: attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}\r\nContent-Transfer-Encoding: base64\r\n\r\n${fold(base64(file.bytes))}`,
          );
        const mime = `${headers.join("\r\n")}\r\n\r\n${parts.map((part) => `--${boundary}\r\n${part}\r\n`).join("")}--${boundary}--\r\n`;
        const raw = base64(new TextEncoder().encode(mime))
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "");
        result = await options.dispatch("messages.send", { body: { raw } });
        if (!result || typeof result.id !== "string")
          throw new Error("SENDFN_MAILBOX_DISPATCH_UNCONFIRMED");
      }
      return {
        success: true,
        providerMessageId: options.provider === "gmail" ? result.id : undefined,
        timestamp: new Date(),
      };
    } catch {
      // Neither API offers general exactly-once sends. An exception may follow dispatch.
      return {
        success: false,
        timestamp: new Date(),
        error: {
          code: "SENDFN_MAILBOX_SEND_FAILED",
          message:
            "Mailbox send failed or its outcome is uncertain; reconcile before retrying",
          retryable: false,
        },
      };
    }
  };
  return {
    name: `connected-${options.provider}`,
    capabilities: {
      supportsIdempotency: false,
      supportsTemplates: false,
      supportsAttachments: true,
      supportsBulkSend: false,
      supportsScheduling: false,
      maxRecipientsPerEmail: 50,
      maxAttachmentSize: 2 * 1024 * 1024,
    },
    async initialize() {
      if (!(await options.isConnected()))
        throw new Error("SENDFN_MAILBOX_NOT_CONNECTED");
    },
    sendEmail,
    async sendBulkEmail(requests) {
      const results = [];
      for (const request of requests) results.push(await sendEmail(request));
      return results;
    },
    validateEmail: isBareEmail,
    isHealthy: options.isConnected,
    async close() {},
  };
}
function base64(bytes: Uint8Array) {
  let value = "";
  for (let i = 0; i < bytes.length; i += 8192)
    value += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(value);
}
function fold(value: string) {
  return value.match(/.{1,76}/g)?.join("\r\n") ?? "";
}
