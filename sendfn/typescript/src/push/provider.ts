import type { PushData } from '../types';

export interface PushProvider {
  readonly name: string;
  readonly platform: 'ios' | 'android' | 'web';
  readonly capabilities: PushProviderCapabilities;

  initialize(): Promise<void>;

  sendPush(params: SendPushRequest): Promise<SendPushResponse>;

  sendBulkPush(params: SendPushRequest[]): Promise<SendPushResponse[]>;

  validateToken(token: string): boolean;

  isHealthy(): Promise<boolean>;

  close(): Promise<void>;
}

export interface PushProviderCapabilities {
  maxPayloadSize: number; // bytes
  supportsBatching: boolean;
  supportsScheduling: boolean;
  supportsImages: boolean;
  supportsSilentPush: boolean;
}

export interface SendPushRequest {
  deviceTokens: string[];
  title: string;
  body: string;
  data?: PushData;
  imageUrl?: string;
  badge?: number;
  sound?: string;
  priority?: 'high' | 'normal';
  ttl?: number;
  collapseKey?: string;
  category?: string;
}

export interface SendPushResponse {
  success: boolean;
  successCount: number;
  failedCount: number;
  invalidTokens: string[]; // Tokens to deactivate
  results: {
    token: string;
    success: boolean;
    error?: string;
  }[];
  timestamp: Date;
}
