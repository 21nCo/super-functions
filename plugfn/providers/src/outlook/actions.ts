import { z } from "zod";
import type { Action } from "plugfn";
import {
  restAction,
  segment,
  remoteId,
  jsonObject,
} from "../shared/rest-action.js";
import { graphPageUrl } from "../shared/graph-pagination.js";
const base = "https://graph.microsoft.com/v1.0/me";
const nextLink = z.string().url().max(16384).optional();
const pageInput = z
  .object({
    nextLink,
    top: z.number().int().min(1).max(100).optional(),
    filter: z.string().max(4096).optional(),
    orderby: z.string().max(1024).optional(),
  })
  .strict();
const page = z
  .object({
    value: z.array(jsonObject),
    "@odata.nextLink": z.string().optional(),
  })
  .passthrough();
const id = z.object({ id: remoteId }).strict();
const message = z.object({ id: z.string() }).passthrough();
const recipient = z
  .object({
    emailAddress: z
      .object({ address: z.string().email(), name: z.string().optional() })
      .strict(),
  })
  .strict();
const mail = z
  .object({
    subject: z.string(),
    body: z
      .object({ contentType: z.enum(["Text", "HTML"]), content: z.string() })
      .strict(),
    toRecipients: z.array(recipient).min(1),
    ccRecipients: z.array(recipient).optional(),
    bccRecipients: z.array(recipient).optional(),
    replyTo: z.array(recipient).optional(),
    internetMessageHeaders: z
      .array(
        z
          .object({
            name: z.string().regex(/^x-/i),
            value: z.string().regex(/^[^\r\n]*$/),
          })
          .strict(),
      )
      .optional(),
    attachments: z.array(jsonObject).optional(),
  })
  .strict();
const eventTime = z
  .object({ dateTime: z.string().min(1), timeZone: z.string().min(1) })
  .strict();
const eventFields = z
  .object({
    subject: z.string(),
    start: eventTime,
    end: eventTime,
    body: z
      .object({ contentType: z.enum(["Text", "HTML"]), content: z.string() })
      .strict()
      .optional(),
    attendees: z
      .array(
        z.object({
          emailAddress: z.object({
            address: z.string().email(),
            name: z.string().optional(),
          }),
          type: z.enum(["required", "optional", "resource"]),
        }),
      )
      .optional(),
    location: jsonObject.optional(),
    recurrence: jsonObject.optional(),
    isAllDay: z.boolean().optional(),
    transactionId: z.string().optional(),
  })
  .strict();
const query = (p: any) =>
  p.nextLink ? {} : { $top: p.top, $filter: p.filter, $orderby: p.orderby };
const pagination = {
  kind: "cursor" as const,
  cursorParameter: "nextLink",
  maxPageSize: 100,
};
export const outlookActions: Record<string, Action> = {
  "mail.messages.list": restAction({
    name: "mail.messages.list",
    method: "GET",
    path: (p) => graphPageUrl(`${base}/messages`, p.nextLink),
    parameters: pageInput,
    query,
    returns: page,
    scopes: ["Mail.Read"],
    pagination,
  }),
  "mail.messages.get": restAction({
    name: "mail.messages.get",
    method: "GET",
    path: (p) => `${base}/messages/${segment(p.id)}`,
    parameters: id,
    returns: message,
    scopes: ["Mail.Read"],
  }),
  "mail.attachments.get": restAction({
    name: "mail.attachments.get",
    method: "GET",
    path: (p) =>
      `${base}/messages/${segment(p.id)}/attachments/${segment(p.attachmentId)}`,
    parameters: id.extend({ attachmentId: remoteId }).strict(),
    returns: z
      .object({ id: z.string(), "@odata.type": z.string() })
      .passthrough(),
    scopes: ["Mail.Read"],
  }),
  "mail.drafts.create": restAction({
    name: "mail.drafts.create",
    method: "POST",
    path: () => `${base}/messages`,
    parameters: z.object({ message: mail }).strict(),
    body: (p) => p.message,
    returns: message,
    scopes: ["Mail.ReadWrite"],
  }),
  "mail.drafts.send": restAction({
    name: "mail.drafts.send",
    method: "POST",
    path: (p) => `${base}/messages/${segment(p.id)}/send`,
    parameters: id,
    returns: z.object({ success: z.literal(true) }),
    scopes: ["Mail.Send"],
    successStatus: 202,
  }),
  "mail.messages.send": restAction({
    name: "mail.messages.send",
    method: "POST",
    path: () => `${base}/sendMail`,
    parameters: z
      .object({ message: mail, saveToSentItems: z.boolean().default(true) })
      .strict(),
    body: (p) => p,
    returns: z.object({ success: z.literal(true) }),
    scopes: ["Mail.Send"],
    successStatus: 202,
  }),
  "calendars.list": restAction({
    name: "calendars.list",
    method: "GET",
    path: (p) => graphPageUrl(`${base}/calendars`, p.nextLink),
    parameters: pageInput,
    query,
    returns: page,
    scopes: ["Calendars.Read"],
    pagination,
  }),
  "events.list": restAction({
    name: "events.list",
    method: "GET",
    path: (p) =>
      graphPageUrl(
        `${base}/calendars/${segment(p.calendarId)}/events`,
        p.nextLink,
      ),
    parameters: pageInput.extend({ calendarId: remoteId }).strict(),
    query,
    returns: page,
    scopes: ["Calendars.Read"],
    pagination,
  }),
  "events.get": restAction({
    name: "events.get",
    method: "GET",
    path: (p) => `${base}/events/${segment(p.id)}`,
    parameters: id,
    returns: message,
    scopes: ["Calendars.Read"],
  }),
  "events.create": restAction({
    name: "events.create",
    method: "POST",
    path: (p) => `${base}/calendars/${segment(p.calendarId)}/events`,
    parameters: z.object({ calendarId: remoteId, event: eventFields }).strict(),
    body: (p) => p.event,
    returns: message,
    scopes: ["Calendars.ReadWrite"],
  }),
  "events.update": restAction({
    name: "events.update",
    method: "PATCH",
    path: (p) => `${base}/events/${segment(p.id)}`,
    parameters: id
      .extend({
        event: eventFields
          .partial()
          .refine((value) => Object.keys(value).length > 0),
      })
      .strict(),
    body: (p) => p.event,
    returns: message,
    scopes: ["Calendars.ReadWrite"],
  }),
  "events.delete": restAction({
    name: "events.delete",
    method: "DELETE",
    path: (p) => `${base}/events/${segment(p.id)}`,
    parameters: id,
    returns: z.object({ success: z.literal(true) }),
    scopes: ["Calendars.ReadWrite"],
  }),
};
