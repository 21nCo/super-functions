import { SmsProvider, SendSmsRequest, SendSmsResponse } from './provider';

export class ConsoleSmsAdapter implements SmsProvider {
  readonly name = 'console-sms';

  async initialize(): Promise<void> {
    // No-op
  }

  async sendSms(params: SendSmsRequest): Promise<SendSmsResponse> {
    console.log(`[SMS] To: ${params.to}, Message: ${params.message}`);
    
    return {
      success: true,
      messageId: `console-${Date.now()}`,
      providerMessageId: `console-${Date.now()}`,
      timestamp: new Date()
    };
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }

  async close(): Promise<void> {
    // No-op
  }
}

export function consoleSmsAdapter(): ConsoleSmsAdapter {
  return new ConsoleSmsAdapter();
}
