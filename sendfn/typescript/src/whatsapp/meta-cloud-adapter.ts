import type { MetaWhatsAppConfig } from '../types';
import {
  type SendWhatsAppRequest,
  type SendWhatsAppResponse,
  type WhatsAppProvider,
} from './provider';

interface MetaWhatsAppMessageResponse {
  messages?: Array<{ id?: string }>;
  error?: {
    code?: number | string;
    message?: string;
    type?: string;
  };
}

export class MetaWhatsAppAdapter implements WhatsAppProvider {
  readonly name = 'meta-whatsapp';

  private readonly endpoint: string;

  constructor(private readonly config: MetaWhatsAppConfig) {
    const apiVersion = config.apiVersion ?? 'v20.0';
    this.endpoint =
      config.endpoint ??
      `https://graph.facebook.com/${apiVersion}/${config.phoneNumberId}/messages`;
  }

  async initialize(): Promise<void> {
    // No persistent resources.
  }

  async sendWhatsApp(params: SendWhatsAppRequest): Promise<SendWhatsAppResponse> {
    const timestamp = new Date();

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: params.to,
          type: 'text',
          text: {
            preview_url: params.previewUrl ?? false,
            body: params.message,
          },
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as MetaWhatsAppMessageResponse;
      const providerMessageId = payload.messages?.[0]?.id;

      if (!response.ok) {
        const code = payload.error?.code ?? `META_WHATSAPP_${response.status}`;
        return {
          success: false,
          timestamp,
          raw: payload,
          error: {
            code: String(code),
            message: payload.error?.message ?? 'Meta WhatsApp request failed',
            retryable: response.status === 429 || response.status >= 500,
          },
        };
      }

      if (!providerMessageId) {
        return {
          success: false,
          timestamp,
          raw: payload,
          error: {
            code: 'META_WHATSAPP_INVALID_RESPONSE',
            message: 'Meta WhatsApp response did not include a message ID',
            retryable: false,
          },
        };
      }

      return {
        success: true,
        messageId: providerMessageId,
        providerMessageId,
        timestamp,
        raw: payload,
      };
    } catch (error) {
      return {
        success: false,
        timestamp,
        error: {
          code: 'META_WHATSAPP_REQUEST_FAILED',
          message: error instanceof Error ? error.message : 'Meta WhatsApp request failed',
          retryable: true,
        },
      };
    }
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }

  async close(): Promise<void> {
    // No persistent resources.
  }
}

export function metaWhatsAppAdapter(config: MetaWhatsAppConfig): MetaWhatsAppAdapter {
  return new MetaWhatsAppAdapter(config);
}
