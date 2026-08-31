import {
  defineAdminCapability,
  type AdminJsonSchema,
  type AdminObjectSchema,
  type AdminOperationDefinition,
  type AdminResourceDefinition,
} from "@superfunctions/admin";
import type {
  SendFnAcceptedOutput,
  SendFnAddSuppressionInput,
  SendFnCleanupDevicesInput,
  SendFnCleanupDevicesOutput,
  SendFnDeactivateDeviceInput,
  SendFnDeactivateDeviceOutput,
  SendFnDeliveryListOutput,
  SendFnDeviceListOutput,
  SendFnDeviceOutput,
  SendFnEmailListOutput,
  SendFnEmailOutput,
  SendFnGetSuppressionInput,
  SendFnGetTemplateInput,
  SendFnListDeliveriesInput,
  SendFnListDeviceTokensInput,
  SendFnListSuppressionsInput,
  SendFnListTemplatesInput,
  SendFnPushListOutput,
  SendFnPushOutput,
  SendFnRefreshDeviceInput,
  SendFnRegisterDeviceInput,
  SendFnRegisterTemplateInput,
  SendFnRemoveSuppressionInput,
  SendFnSendBulkEmailInput,
  SendFnSendBulkPushInput,
  SendFnSendEmailInput,
  SendFnSendPushInput,
  SendFnSendSmsInput,
  SendFnSendWhatsAppInput,
  SendFnSmsOutput,
  SendFnSuppressionListOutput,
  SendFnSuppressionMutationOutput,
  SendFnSuppressionOutput,
  SendFnTemplateListOutput,
  SendFnTemplateOutput,
  SendFnWhatsAppOutput,
} from "./types.js";

const stringSchema = { type: "string", minLength: 1 } as const;
const nullableStringSchema: AdminJsonSchema = { type: ["string", "null"] };
const dateSchema = { type: "string", minLength: 1, maxLength: 100 } as const;
const nullableDateSchema: AdminJsonSchema = { type: ["string", "null"] };
const metadataSchema = { type: "object", additionalProperties: true } as const;
const nullableMetadataSchema: AdminJsonSchema = { type: ["object", "null"], additionalProperties: true };
const platformSchema = { type: "string", enum: ["ios", "android", "web"] } as const;
const recipientOutputSchema: AdminJsonSchema = {
  oneOf: [stringSchema, { type: "array", items: stringSchema, minItems: 1, maxItems: 1000 }],
};

const templateSchema: AdminObjectSchema = {
  type: "object",
  properties: {
    id: stringSchema,
    name: stringSchema,
    subject: { type: "string" },
    html: { type: "string" },
    text: { type: "string" },
    variables: { type: "array", items: stringSchema },
    metadata: metadataSchema,
  },
  required: ["id", "name", "subject", "html", "variables"],
  additionalProperties: false,
};

const emailTransactionSchema: AdminObjectSchema = {
  type: "object",
  properties: {
    id: stringSchema,
    userId: stringSchema,
    to: recipientOutputSchema,
    from: stringSchema,
    subject: { type: "string" },
    templateId: nullableStringSchema,
    templateData: nullableMetadataSchema,
    provider: stringSchema,
    providerMessageId: nullableStringSchema,
    status: { type: "string", enum: ["pending", "sent", "delivered", "bounced", "complained", "failed"] },
    sentAt: nullableDateSchema,
    deliveredAt: nullableDateSchema,
    bouncedAt: nullableDateSchema,
    complainedAt: nullableDateSchema,
    metadata: metadataSchema,
    createdAt: dateSchema,
    updatedAt: dateSchema,
  },
  required: [
    "id", "userId", "to", "from", "subject", "templateId", "templateData", "provider",
    "providerMessageId", "status", "sentAt", "deliveredAt", "bouncedAt", "complainedAt",
    "metadata", "createdAt", "updatedAt",
  ],
  additionalProperties: false,
};

const smsTransactionSchema: AdminObjectSchema = {
  type: "object",
  properties: {
    id: stringSchema,
    userId: stringSchema,
    to: stringSchema,
    message: { type: "string" },
    provider: stringSchema,
    providerMessageId: nullableStringSchema,
    status: { type: "string", enum: ["pending", "sent", "delivered", "failed"] },
    sentAt: nullableDateSchema,
    metadata: metadataSchema,
    createdAt: dateSchema,
    updatedAt: dateSchema,
  },
  required: ["id", "userId", "to", "message", "provider", "providerMessageId", "status", "sentAt", "metadata", "createdAt", "updatedAt"],
  additionalProperties: false,
};

const whatsAppTransactionSchema: AdminObjectSchema = {
  ...smsTransactionSchema,
};

const pushNotificationSchema: AdminObjectSchema = {
  type: "object",
  properties: {
    id: stringSchema,
    userId: stringSchema,
    title: { type: "string" },
    body: { type: "string" },
    data: nullableMetadataSchema,
    deviceTokens: { type: "array", items: stringSchema },
    platform: platformSchema,
    provider: stringSchema,
    status: { type: "string", enum: ["pending", "sent", "failed"] },
    sentCount: { type: "integer", minimum: 0 },
    failedCount: { type: "integer", minimum: 0 },
    sentAt: nullableDateSchema,
    metadata: metadataSchema,
    createdAt: dateSchema,
    updatedAt: dateSchema,
  },
  required: ["id", "userId", "title", "body", "data", "deviceTokens", "platform", "provider", "status", "sentCount", "failedCount", "sentAt", "metadata", "createdAt", "updatedAt"],
  additionalProperties: false,
};

const deliveryEventSchema: AdminObjectSchema = {
  type: "object",
  properties: {
    id: stringSchema,
    referenceId: stringSchema,
    referenceType: { type: "string", enum: ["email", "push", "sms", "whatsapp"] },
    eventType: { type: "string", enum: ["sent", "delivered", "bounced", "complained", "opened", "clicked", "failed"] },
    provider: stringSchema,
    providerEventId: nullableStringSchema,
    recipientEmail: nullableStringSchema,
    recipientPhone: nullableStringSchema,
    deviceToken: nullableStringSchema,
    metadata: metadataSchema,
    eventTimestamp: dateSchema,
    createdAt: dateSchema,
  },
  required: ["id", "referenceId", "referenceType", "eventType", "provider", "providerEventId", "recipientEmail", "recipientPhone", "deviceToken", "metadata", "eventTimestamp", "createdAt"],
  additionalProperties: false,
};

const suppressionSchema: AdminObjectSchema = {
  type: "object",
  properties: {
    id: stringSchema,
    email: stringSchema,
    reason: { type: "string", enum: ["bounce", "complaint", "unsubscribe", "manual"] },
    source: stringSchema,
    bounceType: nullableStringSchema,
    metadata: metadataSchema,
    suppressedAt: dateSchema,
    createdAt: dateSchema,
  },
  required: ["id", "email", "reason", "source", "bounceType", "metadata", "suppressedAt", "createdAt"],
  additionalProperties: false,
};

const deviceTokenSchema: AdminObjectSchema = {
  type: "object",
  properties: {
    id: stringSchema,
    userId: stringSchema,
    token: stringSchema,
    platform: platformSchema,
    appVersion: nullableStringSchema,
    deviceInfo: nullableMetadataSchema,
    isActive: { type: "boolean" },
    lastUsedAt: dateSchema,
    createdAt: dateSchema,
    updatedAt: dateSchema,
  },
  required: ["id", "userId", "token", "platform", "appVersion", "deviceInfo", "isActive", "lastUsedAt", "createdAt", "updatedAt"],
  additionalProperties: false,
};

function listSchema(item: AdminObjectSchema): AdminObjectSchema {
  return {
    type: "object",
    properties: {
      items: { type: "array", items: item },
      nextCursor: { type: "null" },
    },
    required: ["items", "nextCursor"],
    additionalProperties: false,
  };
}

function itemSchema(item: AdminObjectSchema): AdminObjectSchema {
  return {
    type: "object",
    properties: { item },
    required: ["item"],
    additionalProperties: false,
  };
}

const emptyInputSchema: AdminObjectSchema = { type: "object", additionalProperties: false };
const acceptedOutputSchema: AdminObjectSchema = {
  type: "object",
  properties: { accepted: { type: "boolean", const: true } },
  required: ["accepted"],
  additionalProperties: false,
};
const getByIdSchema: AdminObjectSchema = {
  type: "object",
  properties: { id: stringSchema },
  required: ["id"],
  additionalProperties: false,
};

const emailAddressSchema = { type: "string", minLength: 3, maxLength: 1000 } as const;
const stringOrStringsSchema = {
  oneOf: [emailAddressSchema, { type: "array", items: emailAddressSchema, minItems: 1, maxItems: 1000 }],
} as const;
const attachmentSchema: AdminObjectSchema = {
  type: "object",
  properties: {
    filename: stringSchema,
    content: { type: "string" },
    contentType: { type: "string" },
    encoding: { type: "string" },
  },
  required: ["filename", "content"],
  additionalProperties: false,
};
const sendEmailSchema: AdminObjectSchema = {
  type: "object",
  properties: {
    userId: stringSchema,
    from: emailAddressSchema,
    replyTo: emailAddressSchema,
    to: stringOrStringsSchema,
    cc: stringOrStringsSchema,
    bcc: stringOrStringsSchema,
    subject: { type: "string", maxLength: 2000 },
    html: { type: "string", maxLength: 5_000_000 },
    text: { type: "string", maxLength: 5_000_000 },
    templateId: { type: "string", minLength: 1, maxLength: 500 },
    templateData: metadataSchema,
    attachments: { type: "array", items: attachmentSchema, maxItems: 100 },
    headers: metadataSchema,
    metadata: metadataSchema,
    tags: { type: "array", items: stringSchema, maxItems: 100 },
  },
  required: ["userId", "to"],
  additionalProperties: false,
};
const sendSmsSchema: AdminObjectSchema = {
  type: "object",
  properties: { userId: stringSchema, to: stringSchema, message: { type: "string", minLength: 1, maxLength: 10_000 }, metadata: metadataSchema },
  required: ["userId", "to", "message"],
  additionalProperties: false,
};
const sendWhatsAppSchema: AdminObjectSchema = {
  type: "object",
  properties: { ...sendSmsSchema.properties, previewUrl: { type: "boolean" } },
  required: ["userId", "to", "message"],
  additionalProperties: false,
};
const sendPushSchema: AdminObjectSchema = {
  type: "object",
  properties: {
    userId: { oneOf: [stringSchema, { type: "array", items: stringSchema, minItems: 1, maxItems: 1000 }] },
    title: { type: "string", minLength: 1, maxLength: 1000 },
    body: { type: "string", minLength: 1, maxLength: 10_000 },
    data: metadataSchema,
    imageUrl: { type: "string", maxLength: 5000 },
    badge: { type: "integer", minimum: 0 },
    sound: { type: "string", maxLength: 500 },
    priority: { type: "string", enum: ["high", "normal"] },
    ttl: { type: "integer", minimum: 0 },
    collapseKey: { type: "string", maxLength: 500 },
    category: { type: "string", maxLength: 500 },
    metadata: metadataSchema,
  },
  required: ["userId", "title", "body"],
  additionalProperties: false,
};

const listDeliveriesInputSchema: AdminObjectSchema = {
  type: "object",
  properties: {
    referenceId: stringSchema,
    referenceType: { type: "string", enum: ["email", "push", "sms", "whatsapp"] },
    providerMessageId: stringSchema,
    provider: stringSchema,
    userId: stringSchema,
    eventType: { type: "string", enum: ["sent", "delivered", "bounced", "complained", "opened", "clicked", "failed"] },
    startAt: dateSchema,
    endAt: dateSchema,
    limit: { type: "integer", minimum: 0, maximum: 200, default: 50 },
    offset: { type: "integer", minimum: 0, maximum: 1_000_000, default: 0 },
  },
  additionalProperties: false,
};
const listSuppressionsInputSchema: AdminObjectSchema = {
  type: "object",
  properties: {
    limit: { type: "integer", minimum: 1, maximum: 1000, default: 1000 },
    offset: { type: "integer", minimum: 0, maximum: 1_000_000, default: 0 },
  },
  additionalProperties: false,
};
const suppressionIdentitySchema: AdminObjectSchema = {
  type: "object",
  properties: { email: emailAddressSchema },
  required: ["email"],
  additionalProperties: false,
};
const addSuppressionInputSchema: AdminObjectSchema = {
  type: "object",
  properties: {
    email: emailAddressSchema,
    reason: { type: "string", enum: ["bounce", "complaint", "unsubscribe", "manual"] },
    source: stringSchema,
    bounceType: { type: "string" },
    metadata: metadataSchema,
    suppressedAt: dateSchema,
  },
  required: ["email", "reason", "source"],
  additionalProperties: false,
};
const suppressionGetOutputSchema: AdminObjectSchema = {
  type: "object",
  properties: { suppressed: { type: "boolean" }, item: { anyOf: [suppressionSchema, { type: "null" }] } },
  required: ["suppressed", "item"],
  additionalProperties: false,
};
const suppressionMutationOutputSchema: AdminObjectSchema = {
  type: "object",
  properties: { accepted: { type: "boolean", const: true }, item: suppressionSchema, email: emailAddressSchema },
  required: ["accepted", "email"],
  additionalProperties: false,
};

const listDevicesInputSchema: AdminObjectSchema = {
  type: "object",
  properties: { userId: stringSchema, platform: platformSchema },
  required: ["userId"],
  additionalProperties: false,
};
const registerDeviceInputSchema: AdminObjectSchema = {
  type: "object",
  properties: { userId: stringSchema, token: stringSchema, platform: platformSchema, appVersion: { type: "string" }, deviceInfo: metadataSchema },
  required: ["userId", "token", "platform"],
  additionalProperties: false,
};
const deactivateDeviceInputSchema: AdminObjectSchema = {
  type: "object",
  properties: { token: stringSchema },
  required: ["token"],
  additionalProperties: false,
};
const refreshDeviceInputSchema: AdminObjectSchema = {
  type: "object",
  properties: { oldToken: stringSchema, newToken: stringSchema, userId: stringSchema, platform: platformSchema },
  required: ["oldToken", "newToken", "userId", "platform"],
  additionalProperties: false,
};
const cleanupDevicesInputSchema: AdminObjectSchema = {
  type: "object",
  properties: { olderThan: dateSchema },
  required: ["olderThan"],
  additionalProperties: false,
};
const deactivatedOutputSchema: AdminObjectSchema = {
  type: "object",
  properties: { accepted: { type: "boolean", const: true }, deactivatedToken: stringSchema },
  required: ["accepted", "deactivatedToken"],
  additionalProperties: false,
};
const cleanupOutputSchema: AdminObjectSchema = {
  type: "object",
  properties: { accepted: { type: "boolean", const: true }, removed: { type: "integer", minimum: 0 }, olderThan: dateSchema },
  required: ["accepted", "removed", "olderThan"],
  additionalProperties: false,
};

export const sendFnAdminResources = [
  { id: "templates", label: "Templates", description: "Inspect and register SendFn email templates.", icon: "sendfn:templates", risk: "standard", minimumScope: "project", idField: "id", displayFields: ["id", "name", "subject"], searchableFields: ["id", "name", "subject"], filterableFields: [], sortableFields: ["id", "name"], sensitiveFields: [] },
  { id: "messages", label: "Messages", description: "Send email, SMS, WhatsApp, and push communications through configured SendFn providers.", icon: "sendfn:messages", risk: "sensitive", minimumScope: "project", idField: "id", displayFields: ["id", "provider", "status", "createdAt"], searchableFields: ["id", "userId", "providerMessageId"], filterableFields: ["status", "provider"], sortableFields: ["createdAt", "updatedAt"], sensitiveFields: ["to", "message", "body", "html", "text", "deviceTokens"] },
  { id: "deliveries", label: "Delivery Events", description: "Query persisted SendFn delivery and engagement events.", icon: "sendfn:deliveries", risk: "sensitive", minimumScope: "project", idField: "id", displayFields: ["id", "referenceType", "eventType", "provider", "eventTimestamp"], searchableFields: ["id", "referenceId", "providerMessageId", "userId"], filterableFields: ["referenceType", "eventType", "provider", "startAt", "endAt"], sortableFields: ["eventTimestamp"], sensitiveFields: ["recipientEmail", "recipientPhone", "deviceToken"] },
  { id: "suppressions", label: "Suppressions", description: "Inspect and manage SendFn email suppressions and unsubscribes.", icon: "sendfn:suppressions", risk: "sensitive", minimumScope: "project", idField: "email", displayFields: ["email", "reason", "source", "suppressedAt"], searchableFields: ["email", "source"], filterableFields: ["reason", "source"], sortableFields: ["email", "suppressedAt"], sensitiveFields: [] },
  { id: "device-tokens", label: "Device Tokens", description: "Inspect and manage SendFn push-notification device registrations.", icon: "sendfn:device-tokens", risk: "sensitive", minimumScope: "project", idField: "id", displayFields: ["id", "userId", "platform", "isActive", "lastUsedAt"], searchableFields: ["id", "userId"], filterableFields: ["platform", "isActive"], sortableFields: ["lastUsedAt", "updatedAt"], sensitiveFields: ["token"] },
] as const satisfies readonly AdminResourceDefinition[];

export const sendFnAdminActions = [
  { id: "register", resource: "templates" },
  { id: "send-email", resource: "messages" },
  { id: "send-email-bulk", resource: "messages" },
  { id: "send-sms", resource: "messages" },
  { id: "send-whatsapp", resource: "messages" },
  { id: "send-push", resource: "messages" },
  { id: "send-push-bulk", resource: "messages" },
  { id: "add", resource: "suppressions" },
  { id: "remove", resource: "suppressions" },
  { id: "register", resource: "device-tokens" },
  { id: "deactivate", resource: "device-tokens" },
  { id: "refresh", resource: "device-tokens" },
  { id: "cleanup", resource: "device-tokens" },
] as const;

const listTemplates = {
  id: "sendfn.templates.list", title: "List templates", description: "List templates registered in the project-owned SendFn client.",
  inputSchema: emptyInputSchema, outputSchema: listSchema(templateSchema), route: { method: "GET", path: "/resources/templates" }, permission: "sendfn.templates.read", minimumScope: "project",
  safety: { classification: "read", idempotent: true, requiresConfirmation: false, audit: "optional" },
  mcp: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }, target: { resource: "templates", collection: true },
} as const satisfies AdminOperationDefinition<SendFnListTemplatesInput, SendFnTemplateListOutput>;
const getTemplate = {
  id: "sendfn.templates.get", title: "Get template", description: "Get one template from the project-owned SendFn registry.",
  inputSchema: getByIdSchema, outputSchema: itemSchema(templateSchema), route: { method: "GET", path: "/resources/templates/:id" }, permission: "sendfn.templates.read", minimumScope: "project",
  safety: { classification: "read", idempotent: true, requiresConfirmation: false, audit: "optional" },
  mcp: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }, target: { resource: "templates", idInput: "id" },
} as const satisfies AdminOperationDefinition<SendFnGetTemplateInput, SendFnTemplateOutput>;
const registerTemplate = {
  id: "sendfn.templates.register", title: "Register template", description: "Register or replace a SendFn template in the project-owned registry.",
  inputSchema: { type: "object", properties: { template: templateSchema }, required: ["template"], additionalProperties: false }, outputSchema: acceptedOutputSchema,
  route: { method: "POST", path: "/resources/templates/actions/register" }, permission: "sendfn.templates.write", minimumScope: "project",
  safety: { classification: "write", idempotent: true, requiresConfirmation: false, audit: "required" },
  redaction: { inputFields: ["html", "text", "metadata"] }, mcp: { readOnlyHint: false, destructiveHint: false, idempotentHint: true }, target: { resource: "templates", collection: true },
} as const satisfies AdminOperationDefinition<SendFnRegisterTemplateInput, SendFnAcceptedOutput>;
const listDeliveries = {
  id: "sendfn.deliveries.list", title: "List delivery events", description: "Query delivery and engagement events through SendFn's public event API.",
  inputSchema: listDeliveriesInputSchema, outputSchema: listSchema(deliveryEventSchema), route: { method: "GET", path: "/resources/deliveries" }, permission: "sendfn.deliveries.read", minimumScope: "project",
  safety: { classification: "read", idempotent: true, requiresConfirmation: false, audit: "required" },
  mcp: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }, target: { resource: "deliveries", collection: true },
} as const satisfies AdminOperationDefinition<SendFnListDeliveriesInput, SendFnDeliveryListOutput>;

const sendEmail = {
  id: "sendfn.messages.send-email", title: "Send email", description: "Send one email through the configured SendFn email provider.",
  inputSchema: sendEmailSchema, outputSchema: itemSchema(emailTransactionSchema), route: { method: "POST", path: "/resources/messages/actions/send-email" }, permission: "sendfn.messages.send", minimumScope: "project",
  safety: { classification: "write", idempotent: true, requiresConfirmation: true, confirmation: { risk: "high", method: "explicit", reason: "Email delivery contacts an external recipient.", maxAgeSeconds: 300 }, audit: "required" }, redaction: { inputFields: ["to", "cc", "bcc", "html", "text", "attachments", "templateData", "headers", "metadata"] },
  mcp: { readOnlyHint: false, destructiveHint: false, idempotentHint: true }, target: { resource: "messages", collection: true },
} as const satisfies AdminOperationDefinition<SendFnSendEmailInput, SendFnEmailOutput>;
const sendBulkEmail = {
  id: "sendfn.messages.send-email-bulk", title: "Send bulk email", description: "Send an explicitly confirmed collection of emails through SendFn.",
  inputSchema: { type: "object", properties: { messages: { type: "array", items: sendEmailSchema, minItems: 1, maxItems: 1000 } }, required: ["messages"], additionalProperties: false },
  outputSchema: { type: "object", properties: { items: { type: "array", items: emailTransactionSchema } }, required: ["items"], additionalProperties: false },
  route: { method: "POST", path: "/resources/messages/actions/send-email-bulk" }, permission: "sendfn.messages.send-bulk", minimumScope: "project",
  safety: { classification: "write", idempotent: true, requiresConfirmation: true, confirmation: { risk: "high", method: "mfa", reason: "Bulk email can contact many external recipients.", maxAgeSeconds: 300 }, audit: "required" },
  redaction: { inputFields: ["to", "cc", "bcc", "html", "text", "attachments", "templateData", "headers", "metadata"] }, mcp: { readOnlyHint: false, destructiveHint: false, idempotentHint: true }, target: { resource: "messages", collection: true },
} as const satisfies AdminOperationDefinition<SendFnSendBulkEmailInput, SendFnEmailListOutput>;
const sendSms = {
  id: "sendfn.messages.send-sms", title: "Send SMS", description: "Send one SMS through the configured SendFn SMS provider.",
  inputSchema: sendSmsSchema, outputSchema: itemSchema(smsTransactionSchema), route: { method: "POST", path: "/resources/messages/actions/send-sms" }, permission: "sendfn.messages.send", minimumScope: "project",
  safety: { classification: "write", idempotent: false, requiresConfirmation: true, confirmation: { risk: "high", method: "explicit", reason: "SMS delivery contacts an external recipient.", maxAgeSeconds: 300 }, audit: "required" }, redaction: { inputFields: ["to", "message", "metadata"] },
  mcp: { readOnlyHint: false, destructiveHint: false, idempotentHint: false }, target: { resource: "messages", collection: true },
} as const satisfies AdminOperationDefinition<SendFnSendSmsInput, SendFnSmsOutput>;
const sendWhatsApp = {
  id: "sendfn.messages.send-whatsapp", title: "Send WhatsApp message", description: "Send one WhatsApp message through the configured SendFn provider.",
  inputSchema: sendWhatsAppSchema, outputSchema: itemSchema(whatsAppTransactionSchema), route: { method: "POST", path: "/resources/messages/actions/send-whatsapp" }, permission: "sendfn.messages.send", minimumScope: "project",
  safety: { classification: "write", idempotent: false, requiresConfirmation: true, confirmation: { risk: "high", method: "explicit", reason: "WhatsApp delivery contacts an external recipient.", maxAgeSeconds: 300 }, audit: "required" }, redaction: { inputFields: ["to", "message", "metadata"] },
  mcp: { readOnlyHint: false, destructiveHint: false, idempotentHint: false }, target: { resource: "messages", collection: true },
} as const satisfies AdminOperationDefinition<SendFnSendWhatsAppInput, SendFnWhatsAppOutput>;
const sendPush = {
  id: "sendfn.messages.send-push", title: "Send push notification", description: "Send one push notification through configured SendFn platform providers.",
  inputSchema: sendPushSchema, outputSchema: itemSchema(pushNotificationSchema), route: { method: "POST", path: "/resources/messages/actions/send-push" }, permission: "sendfn.messages.send", minimumScope: "project",
  safety: { classification: "write", idempotent: false, requiresConfirmation: true, confirmation: { risk: "high", method: "explicit", reason: "Push delivery notifies an external user device.", maxAgeSeconds: 300 }, audit: "required" }, redaction: { inputFields: ["userId", "body", "data", "metadata"], outputFields: ["deviceTokens"] },
  mcp: { readOnlyHint: false, destructiveHint: false, idempotentHint: false }, target: { resource: "messages", collection: true },
} as const satisfies AdminOperationDefinition<SendFnSendPushInput, SendFnPushOutput>;
const sendBulkPush = {
  id: "sendfn.messages.send-push-bulk", title: "Send bulk push notifications", description: "Send an explicitly confirmed collection of push notifications through SendFn.",
  inputSchema: { type: "object", properties: { messages: { type: "array", items: sendPushSchema, minItems: 1, maxItems: 1000 } }, required: ["messages"], additionalProperties: false },
  outputSchema: { type: "object", properties: { items: { type: "array", items: pushNotificationSchema } }, required: ["items"], additionalProperties: false },
  route: { method: "POST", path: "/resources/messages/actions/send-push-bulk" }, permission: "sendfn.messages.send-bulk", minimumScope: "project",
  safety: { classification: "write", idempotent: false, requiresConfirmation: true, confirmation: { risk: "high", method: "mfa", reason: "Bulk push can notify many users.", maxAgeSeconds: 300 }, audit: "required" },
  redaction: { inputFields: ["userId", "body", "data", "metadata"], outputFields: ["deviceTokens"] }, mcp: { readOnlyHint: false, destructiveHint: false, idempotentHint: false }, target: { resource: "messages", collection: true },
} as const satisfies AdminOperationDefinition<SendFnSendBulkPushInput, SendFnPushListOutput>;

const listSuppressions = {
  id: "sendfn.suppressions.list", title: "List suppressions", description: "List suppressions through SendFn's public export API.",
  inputSchema: listSuppressionsInputSchema, outputSchema: listSchema(suppressionSchema), route: { method: "GET", path: "/resources/suppressions" }, permission: "sendfn.suppressions.read", minimumScope: "project",
  safety: { classification: "read", idempotent: true, requiresConfirmation: false, audit: "required" }, mcp: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }, target: { resource: "suppressions", collection: true },
} as const satisfies AdminOperationDefinition<SendFnListSuppressionsInput, SendFnSuppressionListOutput>;
const getSuppression = {
  id: "sendfn.suppressions.get", title: "Check suppression", description: "Check whether one email address is suppressed in SendFn.",
  inputSchema: suppressionIdentitySchema, outputSchema: suppressionGetOutputSchema, route: { method: "GET", path: "/resources/suppressions/:email" }, permission: "sendfn.suppressions.read", minimumScope: "project",
  safety: { classification: "read", idempotent: true, requiresConfirmation: false, audit: "required" }, redaction: { inputFields: ["email"] },
  mcp: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }, target: { resource: "suppressions", idInput: "email" },
} as const satisfies AdminOperationDefinition<SendFnGetSuppressionInput, SendFnSuppressionOutput>;
const addSuppression = {
  id: "sendfn.suppressions.add", title: "Add suppression", description: "Add an email address to SendFn's suppression list.",
  inputSchema: addSuppressionInputSchema, outputSchema: suppressionMutationOutputSchema, route: { method: "POST", path: "/resources/suppressions/actions/add" }, permission: "sendfn.suppressions.write", minimumScope: "project",
  safety: { classification: "write", idempotent: true, requiresConfirmation: false, audit: "required" }, redaction: { inputFields: ["email", "metadata"] },
  mcp: { readOnlyHint: false, destructiveHint: false, idempotentHint: true }, target: { resource: "suppressions", idInput: "email" },
} as const satisfies AdminOperationDefinition<SendFnAddSuppressionInput, SendFnSuppressionMutationOutput>;
const removeSuppression = {
  id: "sendfn.suppressions.remove", title: "Remove suppression", description: "Remove one suppression after recent-auth confirmation, allowing future delivery.",
  inputSchema: suppressionIdentitySchema, outputSchema: suppressionMutationOutputSchema, route: { method: "POST", path: "/resources/suppressions/actions/remove" }, permission: "sendfn.suppressions.remove", minimumScope: "project",
  safety: { classification: "destructive", idempotent: true, requiresConfirmation: true, confirmation: { risk: "high", method: "recent-auth", reason: "Removing a suppression allows future contact to the address.", maxAgeSeconds: 300 }, audit: "required" },
  redaction: { inputFields: ["email"] }, mcp: { readOnlyHint: false, destructiveHint: true, idempotentHint: true }, target: { resource: "suppressions", idInput: "email" },
} as const satisfies AdminOperationDefinition<SendFnRemoveSuppressionInput, SendFnSuppressionMutationOutput>;

const listDeviceTokens = {
  id: "sendfn.device-tokens.list", title: "List device tokens", description: "List active device registrations for one SendFn user.",
  inputSchema: listDevicesInputSchema, outputSchema: listSchema(deviceTokenSchema), route: { method: "GET", path: "/resources/device-tokens" }, permission: "sendfn.device-tokens.read", minimumScope: "project",
  safety: { classification: "read", idempotent: true, requiresConfirmation: false, audit: "required" }, redaction: { outputFields: ["token"] }, mcp: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }, target: { resource: "device-tokens", collection: true },
} as const satisfies AdminOperationDefinition<SendFnListDeviceTokensInput, SendFnDeviceListOutput>;
const registerDevice = {
  id: "sendfn.device-tokens.register", title: "Register device token", description: "Register or reactivate a SendFn device token.",
  inputSchema: registerDeviceInputSchema, outputSchema: itemSchema(deviceTokenSchema), route: { method: "POST", path: "/resources/device-tokens/actions/register" }, permission: "sendfn.device-tokens.write", minimumScope: "project",
  safety: { classification: "write", idempotent: true, requiresConfirmation: true, confirmation: { risk: "high", method: "recent-auth", reason: "Registering a device credential authorizes future external push delivery.", maxAgeSeconds: 300 }, audit: "required" }, redaction: { inputFields: ["token", "deviceInfo"], outputFields: ["token"] },
  mcp: { readOnlyHint: false, destructiveHint: false, idempotentHint: true }, target: { resource: "device-tokens", idInput: "token" },
} as const satisfies AdminOperationDefinition<SendFnRegisterDeviceInput, SendFnDeviceOutput>;
const deactivateDevice = {
  id: "sendfn.device-tokens.deactivate", title: "Deactivate device token", description: "Deactivate one device token after explicit confirmation.",
  inputSchema: deactivateDeviceInputSchema, outputSchema: deactivatedOutputSchema, route: { method: "POST", path: "/resources/device-tokens/actions/deactivate" }, permission: "sendfn.device-tokens.deactivate", minimumScope: "project",
  safety: { classification: "destructive", idempotent: true, requiresConfirmation: true, confirmation: { risk: "high", method: "recent-auth", reason: "Deactivation stops push delivery to the device." }, audit: "required" }, redaction: { inputFields: ["token"], outputFields: ["deactivatedToken"] },
  mcp: { readOnlyHint: false, destructiveHint: true, idempotentHint: true }, target: { resource: "device-tokens", idInput: "token" },
} as const satisfies AdminOperationDefinition<SendFnDeactivateDeviceInput, SendFnDeactivateDeviceOutput>;
const refreshDevice = {
  id: "sendfn.device-tokens.refresh", title: "Refresh device token", description: "Replace an active SendFn device token with a new token.",
  inputSchema: refreshDeviceInputSchema, outputSchema: itemSchema(deviceTokenSchema), route: { method: "POST", path: "/resources/device-tokens/actions/refresh" }, permission: "sendfn.device-tokens.write", minimumScope: "project",
  safety: { classification: "write", idempotent: false, requiresConfirmation: true, confirmation: { risk: "critical", method: "mfa", reason: "Refreshing replaces an active device delivery credential.", maxAgeSeconds: 300 }, audit: "required" }, redaction: { inputFields: ["oldToken", "newToken"], outputFields: ["token"] },
  mcp: { readOnlyHint: false, destructiveHint: false, idempotentHint: false }, target: { resource: "device-tokens", idInput: "oldToken" },
} as const satisfies AdminOperationDefinition<SendFnRefreshDeviceInput, SendFnDeviceOutput>;
const cleanupDevices = {
  id: "sendfn.device-tokens.cleanup", title: "Clean up inactive devices", description: "Permanently remove inactive device tokens older than a confirmed cutoff.",
  inputSchema: cleanupDevicesInputSchema, outputSchema: cleanupOutputSchema, route: { method: "POST", path: "/resources/device-tokens/actions/cleanup" }, permission: "sendfn.device-tokens.cleanup", minimumScope: "project",
  safety: { classification: "destructive", idempotent: false, requiresConfirmation: true, confirmation: { risk: "high", method: "recent-auth", reason: "Cleanup permanently deletes inactive device registrations.", maxAgeSeconds: 300 }, audit: "required" },
  mcp: { readOnlyHint: false, destructiveHint: true, idempotentHint: false }, target: { resource: "device-tokens", idInput: "olderThan" },
} as const satisfies AdminOperationDefinition<SendFnCleanupDevicesInput, SendFnCleanupDevicesOutput>;

export const sendFnAdminOperations = [
  listTemplates, getTemplate, registerTemplate, listDeliveries,
  sendEmail, sendBulkEmail, sendSms, sendWhatsApp, sendPush, sendBulkPush,
  listSuppressions, getSuppression, addSuppression, removeSuppression,
  listDeviceTokens, registerDevice, deactivateDevice, refreshDevice, cleanupDevices,
] as const;

export type SendFnAdminOperationId = (typeof sendFnAdminOperations)[number]["id"];

export const sendFnAdminCapability = defineAdminCapability({
  schemaVersion: "1.0",
  id: "sendfn",
  displayName: "SendFn",
  version: "1.0.0",
  description: "Project-scoped operator capabilities backed by the public SendFn client.",
  category: "communication",
  availability: "required-product",
  scopeLevels: ["installation", "workspace", "project", "environment"],
  dependencies: [],
  resources: sendFnAdminResources,
  navigation: [{ id: "sendfn", label: "SendFn", path: "/modules/sendfn", icon: "sendfn", description: "Operate project-owned communications.", order: 100 }],
  operations: sendFnAdminOperations,
});

export const sendFnAdminSchemas = {
  template: templateSchema,
  emailTransaction: emailTransactionSchema,
  smsTransaction: smsTransactionSchema,
  whatsAppTransaction: whatsAppTransactionSchema,
  pushNotification: pushNotificationSchema,
  deliveryEvent: deliveryEventSchema,
  suppression: suppressionSchema,
  deviceToken: deviceTokenSchema,
} as const;
