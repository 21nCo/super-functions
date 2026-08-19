export type DeliveryChannel =
  | "email"
  | "sms"
  | "push"
  | (string & {});

export type DeliveryMetadata = Record<string, unknown>;

export type DeliveryMaybePromise<T> = T | Promise<T>;

export interface DeliveryRequest<
  TChannel extends DeliveryChannel = DeliveryChannel,
  TMetadata extends DeliveryMetadata = DeliveryMetadata
> {
  channel: TChannel;
  kind?: string;
  metadata?: TMetadata;
}

export interface EmailDeliveryRequest<
  TMetadata extends DeliveryMetadata = DeliveryMetadata
> extends DeliveryRequest<"email", TMetadata> {
  to: string | string[];
  subject?: string;
  html?: string;
  text?: string;
  userId?: string;
  cc?: string | string[];
  bcc?: string | string[];
  attachments?: DeliveryAttachment[];
  tags?: string[];
}

export interface SmsDeliveryRequest<
  TMetadata extends DeliveryMetadata = DeliveryMetadata
> extends DeliveryRequest<"sms", TMetadata> {
  to: string;
  message: string;
  userId?: string;
}

export interface PushDeliveryRequest<
  TMetadata extends DeliveryMetadata = DeliveryMetadata
> extends DeliveryRequest<"push", TMetadata> {
  userId: string | string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
  imageUrl?: string;
  badge?: number;
  sound?: string;
  priority?: "high" | "normal";
  ttl?: number;
  collapseKey?: string;
  category?: string;
}

export interface DeliveryAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
  encoding?: string;
}

export type CommunicationDeliveryRequest =
  | EmailDeliveryRequest
  | SmsDeliveryRequest
  | PushDeliveryRequest;

export interface DeliveryResult<
  TMetadata extends DeliveryMetadata = DeliveryMetadata
> {
  sent: boolean;
  metadata?: TMetadata;
}

export interface DeliveryProvider<
  TRequest extends DeliveryRequest = DeliveryRequest,
  TResult extends DeliveryResult = DeliveryResult,
  TEvent = never
> {
  send(input: TRequest): DeliveryMaybePromise<TResult>;
  emit?(event: TEvent): DeliveryMaybePromise<void>;
}
