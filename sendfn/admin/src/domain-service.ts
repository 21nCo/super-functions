import { SendfnError } from "sendfn";
import { AdminError, type AdminOperationContext } from "@superfunctions/admin";
import type {
  SendFnAdminJson,
  SendFnAdminService,
  SendFnDomainAdminServiceOptions,
} from "./types.js";

function toAdminJson<T>(value: T): SendFnAdminJson<T> {
  const visit = (current: unknown): unknown => {
    if (current instanceof Date) return current.toISOString();
    if (Array.isArray(current)) return current.map(visit);
    if (!current || typeof current !== "object") return current;
    return Object.fromEntries(
      Object.entries(current as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, visit(item)]),
    );
  };
  return visit(value) as SendFnAdminJson<T>;
}

function safeDeviceToken<T extends { token: string }>(value: T): SendFnAdminJson<T> {
  return { ...toAdminJson(value), token: "[REDACTED]" } as SendFnAdminJson<T>;
}

function safePushNotification<T extends { deviceTokens: string[] }>(value: T): SendFnAdminJson<T> {
  return {
    ...toAdminJson(value),
    deviceTokens: value.deviceTokens.map(() => "[REDACTED]"),
  } as SendFnAdminJson<T>;
}

function parseDate(value: string, label: string): Date {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new AdminError("invalid_argument", `${label} must be a valid date-time.`);
  }
  return parsed;
}

function requiredIdempotencyKey(context: AdminOperationContext): string {
  if (!context.idempotencyKey) {
    throw new AdminError("precondition_failed", "This SendFn operation requires an idempotency key.");
  }
  return context.idempotencyKey;
}

function translateSendFnError(error: unknown): never {
  if (error instanceof AdminError) throw error;
  if (!(error instanceof SendfnError)) {
    throw new AdminError("internal", "SendFn could not complete the administration operation.", { cause: error });
  }

  if (
    error.code === "SENDFN_VALIDATION_ERROR" ||
    error.code === "SENDFN_TEMPLATE_ERROR" ||
    error.code === "SENDFN_TEMPLATE_NOT_FOUND" ||
    error.code === "SENDFN_TEMPLATE_RENDER_ERROR"
  ) {
    throw new AdminError("invalid_argument", error.message, {
      details: error.details,
      retryable: error.retryable,
      cause: error,
    });
  }
  if (error.code === "SENDFN_SUPPRESSION_ERROR") {
    throw new AdminError("conflict", error.message, {
      details: error.details,
      retryable: error.retryable,
      cause: error,
    });
  }
  if (error.code.endsWith("_PROVIDER_ERROR") || error.code === "SENDFN_DATABASE_ERROR") {
    throw new AdminError("dependency_unavailable", error.message, {
      details: error.details,
      retryable: error.retryable,
      cause: error,
    });
  }
  throw new AdminError("internal", "SendFn could not complete the administration operation.", {
    details: { domainCode: error.code },
    retryable: error.retryable,
    cause: error,
  });
}

async function domain<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    return translateSendFnError(error);
  }
}

/**
 * Binds a project-owned public SendFn client to the shared administration
 * contract. No database or provider is accessed directly, so SendFn's
 * validation, suppression, provider, event, and storage invariants remain the
 * authoritative domain boundary.
 */
export function createSendFnDomainAdminService(
  options: SendFnDomainAdminServiceOptions,
): SendFnAdminService {
  if (!options.projectId.trim()) {
    throw new AdminError("invalid_argument", "SendFn admin binding requires a projectId.");
  }
  const { sendfn, projectId } = options;

  const assertProject = (context: AdminOperationContext): void => {
    if (!context.scope.projectId || context.scope.projectId !== projectId) {
      throw new AdminError("forbidden", "The active project cannot access this SendFn client.");
    }
  };

  return {
    async listTemplates(_input, context) {
      assertProject(context);
      const templates = await domain(() => sendfn.listTemplates());
      return { items: toAdminJson(templates), nextCursor: null };
    },

    async getTemplate(input, context) {
      assertProject(context);
      const template = await domain(() => sendfn.getTemplate(input.id));
      if (!template) {
        throw new AdminError("not_found", "The SendFn template was not found in the active project.");
      }
      return { item: toAdminJson(template) };
    },

    async registerTemplate(input, context) {
      assertProject(context);
      await domain(() => sendfn.registerTemplate(input.template));
      return { accepted: true };
    },

    async listDeliveries(input, context) {
      assertProject(context);
      const { startAt, endAt, ...query } = input;
      const events = await domain(() => sendfn.queryEvents({
        ...query,
        ...(startAt ? { startAt: parseDate(startAt, "startAt") } : {}),
        ...(endAt ? { endAt: parseDate(endAt, "endAt") } : {}),
      }));
      return { items: toAdminJson(events), nextCursor: null };
    },

    async sendEmail(input, context) {
      assertProject(context);
      const transaction = await domain(() => sendfn.email({
        ...input,
        idempotencyKey: requiredIdempotencyKey(context),
      }));
      return { item: toAdminJson(transaction) };
    },

    async sendBulkEmail(input, context) {
      assertProject(context);
      const rootKey = requiredIdempotencyKey(context);
      const transactions = await domain(() => sendfn.bulkEmail(
        input.messages.map((message, index) => ({
          ...message,
          idempotencyKey: `${rootKey}:${index}`,
        })),
      ));
      return { items: toAdminJson(transactions) };
    },

    async sendSms(input, context) {
      assertProject(context);
      return { item: toAdminJson(await domain(() => sendfn.sms(input))) };
    },

    async sendWhatsApp(input, context) {
      assertProject(context);
      return { item: toAdminJson(await domain(() => sendfn.whatsapp(input))) };
    },

    async sendPush(input, context) {
      assertProject(context);
      return { item: safePushNotification(await domain(() => sendfn.push(input))) };
    },

    async sendBulkPush(input, context) {
      assertProject(context);
      const notifications = await domain(() => sendfn.bulkPush(input.messages));
      return { items: notifications.map(safePushNotification) };
    },

    async listSuppressions(input, context) {
      assertProject(context);
      const items = await domain(() => sendfn.exportSuppressionList(input.limit, input.offset));
      return { items: toAdminJson(items), nextCursor: null };
    },

    async getSuppression(input, context) {
      assertProject(context);
      const result = await domain(() => sendfn.checkSuppressionList(input.email));
      return {
        suppressed: result.suppressed,
        item: result.entry ? toAdminJson(result.entry) : null,
      };
    },

    async addSuppression(input, context) {
      assertProject(context);
      const item = await domain(() => sendfn.addToSuppressionList({
        email: input.email,
        reason: input.reason,
        source: input.source,
        bounceType: input.bounceType ?? null,
        metadata: input.metadata ?? {},
        suppressedAt: input.suppressedAt
          ? parseDate(input.suppressedAt, "suppressedAt")
          : context.now ?? new Date(),
      }));
      return { accepted: true, item: toAdminJson(item), email: item.email };
    },

    async removeSuppression(input, context) {
      assertProject(context);
      await domain(() => sendfn.removeFromSuppressionList(input.email));
      return { accepted: true, email: input.email };
    },

    async listDeviceTokens(input, context) {
      assertProject(context);
      const devices = await domain(() => sendfn.getDevices(input.userId, input.platform));
      return { items: devices.map(safeDeviceToken), nextCursor: null };
    },

    async registerDevice(input, context) {
      assertProject(context);
      return { item: safeDeviceToken(await domain(() => sendfn.registerDevice(input))) };
    },

    async deactivateDevice(input, context) {
      assertProject(context);
      await domain(() => sendfn.deactivateDevice(input.token));
      return { accepted: true, deactivatedToken: "[REDACTED]" };
    },

    async refreshDevice(input, context) {
      assertProject(context);
      const device = await domain(() => sendfn.refreshDeviceToken(
        input.oldToken,
        input.newToken,
        input.userId,
        input.platform,
      ));
      return { item: safeDeviceToken(device) };
    },

    async cleanupDevices(input, context) {
      assertProject(context);
      const olderThan = parseDate(input.olderThan, "olderThan");
      const removed = await domain(() => sendfn.cleanupInactiveDevices(olderThan));
      return { accepted: true, removed, olderThan: olderThan.toISOString() };
    },
  };
}
