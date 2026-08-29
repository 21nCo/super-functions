import type {
  DeliveryProvider,
  DeliveryResult,
  EmailDeliveryRequest
} from '@superfunctions/delivery';
import type { EmailTransaction, SendEmailParams } from './types';

export interface SendFnEmailClient {
  email(params: SendEmailParams): Promise<EmailTransaction>;
}

export type SendFnDeliveryRenderer<
  TRequest extends EmailDeliveryRequest = EmailDeliveryRequest
> = (
  request: TRequest
) => Partial<SendEmailParams> | Promise<Partial<SendEmailParams>>;

export interface SendFnDeliveryProviderOptions<
  TRequest extends EmailDeliveryRequest = EmailDeliveryRequest
> {
  defaultUserId?: string | ((request: TRequest) => string);
  render?: SendFnDeliveryRenderer<TRequest>;
}

export function createSendFnDeliveryProvider<
  TRequest extends EmailDeliveryRequest = EmailDeliveryRequest
>(
  client: SendFnEmailClient,
  options: SendFnDeliveryProviderOptions<TRequest> = {}
): DeliveryProvider<TRequest, DeliveryResult> {
  return {
    async send(request) {
      const defaults = defaultEmailParams(request, options);
      const rendered = await options.render?.(request);
      const result = await client.email({
        ...defaults,
        ...rendered,
        metadata: {
          ...(defaults.metadata ?? {}),
          ...(rendered?.metadata ?? {})
        }
      });
      const metadata: Record<string, unknown> = {
        provider: result.provider,
        transactionId: result.id
      };
      if (result.providerMessageId) {
        metadata.providerMessageId = result.providerMessageId;
      }
      return {
        sent: true,
        metadata
      };
    }
  };
}

function defaultEmailParams<TRequest extends EmailDeliveryRequest>(
  request: TRequest,
  options: SendFnDeliveryProviderOptions<TRequest>
): SendEmailParams {
  return {
    userId: resolveUserId(request, options),
    to: request.to,
    cc: request.cc,
    bcc: request.bcc,
    subject: request.subject,
    html: request.html,
    text: request.text,
    attachments: request.attachments,
    metadata: request.metadata,
    tags: request.tags
  };
}

function resolveUserId<TRequest extends EmailDeliveryRequest>(
  request: TRequest,
  options: SendFnDeliveryProviderOptions<TRequest>
): string {
  if (request.userId) {
    return request.userId;
  }
  if (typeof options.defaultUserId === 'function') {
    return options.defaultUserId(request);
  }
  return options.defaultUserId ?? 'delivery';
}
