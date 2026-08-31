export interface WhatsAppProvider {
  readonly name: string;

  initialize(): Promise<void>;

  sendWhatsApp(params: SendWhatsAppRequest): Promise<SendWhatsAppResponse>;

  isHealthy(): Promise<boolean>;

  close(): Promise<void>;
}

export interface SendWhatsAppRequest {
  to: string;
  message: string;
  previewUrl?: boolean;
  metadata?: Record<string, any>;
}

export interface SendWhatsAppResponse {
  success: boolean;
  messageId?: string;
  providerMessageId?: string;
  timestamp: Date;
  raw?: unknown;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
}
