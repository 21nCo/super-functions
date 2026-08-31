export interface SmsProvider {
  readonly name: string;

  initialize(): Promise<void>;

  sendSms(params: SendSmsRequest): Promise<SendSmsResponse>;

  isHealthy(): Promise<boolean>;

  close(): Promise<void>;
}

export interface SendSmsRequest {
  to: string;
  message: string;
  metadata?: Record<string, any>;
}

export interface SendSmsResponse {
  success: boolean;
  messageId?: string;
  providerMessageId?: string;
  timestamp: Date;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
}
