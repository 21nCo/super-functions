import { resendAdapter } from './email/resend-adapter';
import { isBareEmail } from './email/address';
import type { EmailProvider } from './email/provider';
import type { WhatsAppProvider } from './whatsapp/provider';
import type {
  EmailTransaction,
  SendEmailParams,
  SendWhatsAppParams,
  WhatsAppTransaction,
} from './types';

export { resendAdapter };
export {
  createSendFnDeliveryProvider,
  type SendFnDeliveryProviderOptions,
  type SendFnDeliveryRenderer,
  type SendFnEmailClient
} from './delivery';

export interface SendFnEdgeConfig {
  emailProvider?: EmailProvider;
  whatsappProvider?: WhatsAppProvider;
  email?: {
    /**
     * Full RFC 5322-ish sender string, for example:
     * `Nucleum <no-reply@example.com>`.
     */
    from?: string;
    /**
     * Bare sender email address. Display names belong in `fromName`.
     */
    fromEmail?: string;
    fromName?: string;
  };
}

export interface SendFnEdgeClient {
  email(params: SendEmailParams): Promise<EmailTransaction>;
  whatsapp(params: SendWhatsAppParams): Promise<WhatsAppTransaction>;
  close(): Promise<void>;
}

export function createSendFn(config: SendFnEdgeConfig): SendFnEdgeClient {
  let emailInitialized = false;
  let whatsappInitialized = false;

  async function ensureEmailInitialized(): Promise<void> {
    if (!config.emailProvider) {
      throw new Error('SendFn email provider not configured');
    }

    if (!emailInitialized) {
      await config.emailProvider.initialize();
      emailInitialized = true;
    }
  }

  async function ensureWhatsAppInitialized(): Promise<void> {
    if (!config.whatsappProvider) {
      throw new Error('SendFn WhatsApp provider not configured');
    }

    if (!whatsappInitialized) {
      await config.whatsappProvider.initialize();
      whatsappInitialized = true;
    }
  }

  return {
    async email(params) {
      await ensureEmailInitialized();
      const emailProvider = config.emailProvider!;
      const now = new Date();
      const recipients = toArray(params.to) ?? [];
      const sender = resolveSender(config.email);
      if (params.replyTo !== undefined && (
        /[\r\n,]/.test(params.replyTo) ||
        !emailProvider.validateEmail(params.replyTo)
      )) {
        throw new Error('Invalid replyTo. Use a single valid mailbox without control characters.');
      }
      const response = await emailProvider.sendEmail({
        idempotencyKey: params.idempotencyKey,
        from: sender.header,
        to: recipients,
        cc: toArray(params.cc),
        bcc: toArray(params.bcc),
        subject: params.subject ?? '',
        html: params.html ?? '',
        text: params.text,
        replyTo: params.replyTo,
        attachments: params.attachments,
        metadata: params.metadata,
        tags: params.tags
          ? Object.fromEntries(params.tags.map((tag) => [tag, tag]))
          : undefined,
      });

      if (!response.success) {
        throw new Error(response.error?.message ?? 'SendFn email delivery failed');
      }

      return {
        id: response.messageId ?? response.providerMessageId ?? crypto.randomUUID(),
        userId: params.userId,
        to: recipients[0] ?? '',
        from: sender.email,
        subject: params.subject ?? '',
        templateId: params.templateId ?? null,
        templateData: params.templateData ?? null,
        status: 'sent',
        provider: emailProvider.name,
        providerMessageId: response.providerMessageId ?? response.messageId ?? null,
        deliveredAt: null,
        bouncedAt: null,
        complainedAt: null,
        metadata: params.metadata ?? {},
        createdAt: now,
        updatedAt: now,
        sentAt: response.timestamp
      } as EmailTransaction;
    },
    async whatsapp(params) {
      await ensureWhatsAppInitialized();
      const whatsappProvider = config.whatsappProvider!;
      const now = new Date();
      const response = await whatsappProvider.sendWhatsApp({
        to: params.to,
        message: params.message,
        previewUrl: params.previewUrl,
        metadata: params.metadata,
      });

      if (!response.success) {
        throw new Error(response.error?.message ?? 'SendFn WhatsApp delivery failed');
      }

      return {
        id: crypto.randomUUID(),
        userId: params.userId,
        to: params.to,
        message: params.message,
        provider: whatsappProvider.name,
        providerMessageId: response.providerMessageId ?? response.messageId ?? null,
        status: 'sent',
        sentAt: response.timestamp,
        metadata: {
          ...(params.metadata ?? {}),
          raw: response.raw,
        },
        createdAt: now,
        updatedAt: now,
      } as WhatsAppTransaction;
    },
    async close() {
      await Promise.all([
        config.emailProvider?.close(),
        config.whatsappProvider?.close(),
      ]);
    }
  };
}

export const sendFn = createSendFn;
export const sendfn = createSendFn;

function toArray(value: string | string[] | undefined): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  return Array.isArray(value) ? value : [value];
}

interface SenderConfig {
  from?: string;
  fromEmail?: string;
  fromName?: string;
}

interface ResolvedSender {
  header: string;
  email: string;
}

function resolveSender(config: SenderConfig | undefined): ResolvedSender {
  const explicitFrom = config?.from?.trim();
  if (explicitFrom) {
    return parseSender(explicitFrom, 'email.from');
  }

  const rawFromEmail = (config?.fromEmail ?? 'noreply@example.com').trim();
  const fromName = config?.fromName?.trim();
  if (fromName && hasHeaderControlCharacter(fromName)) {
    throw new Error('Invalid email.fromName. Display names cannot contain control characters.');
  }
  const parsedFromEmail = tryParseSender(rawFromEmail);
  if (parsedFromEmail) {
    const displayName = fromName || parsedFromEmail.name;
    return {
      header: displayName ? `${displayName} <${parsedFromEmail.email}>` : parsedFromEmail.email,
      email: parsedFromEmail.email,
    };
  }

  assertBareEmail(rawFromEmail, 'email.fromEmail');
  return {
    header: fromName ? `${fromName} <${rawFromEmail}>` : rawFromEmail,
    email: rawFromEmail,
  };
}

function parseSender(value: string, fieldName: string): ResolvedSender {
  const parsed = tryParseSender(value);
  if (!parsed) {
    throw new Error(
      `Invalid ${fieldName}. Use email@example.com or Name <email@example.com>.`
    );
  }

  return {
    header: parsed.name ? `${parsed.name} <${parsed.email}>` : parsed.email,
    email: parsed.email,
  };
}

function tryParseSender(value: string): { name?: string; email: string } | null {
  if (isBareEmail(value)) {
    return { email: value };
  }

  if (!value.endsWith('>')) {
    return null;
  }

  const openingBracket = value.lastIndexOf('<');
  if (
    openingBracket <= 0 ||
    value.indexOf('<') !== openingBracket ||
    value.indexOf('>') !== value.length - 1
  ) {
    return null;
  }

  let name = value.slice(0, openingBracket).trim();
  if (name.length > 2 && name.startsWith('"') && name.endsWith('"')) {
    name = name.slice(1, -1);
  }
  const email = value.slice(openingBracket + 1, -1).trim();
  if (!name || !isBareEmail(email)) {
    return null;
  }
  if (hasHeaderControlCharacter(name)) {
    return null;
  }

  return { name, email };
}

function hasHeaderControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}

function assertBareEmail(value: string, fieldName: string): void {
  if (!isBareEmail(value)) {
    throw new Error(
      `Invalid ${fieldName}. Use a bare email address or set email.from to Name <email@example.com>.`
    );
  }
}
