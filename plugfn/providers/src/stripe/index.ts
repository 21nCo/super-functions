import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import {
  AuthType,
  TriggerType,
  type ActionContext,
  type Provider,
  type WebhookVerificationContext,
} from 'plugfn';

/**
 * Stripe provider
 */
export const stripeProvider: Provider = {
  name: 'stripe',
  displayName: 'Stripe',
  version: '1.0.0',
  description: 'Integration with Stripe for payment processing',
  iconUrl: 'https://stripe.com/favicon.ico',
  baseUrl: 'https://api.stripe.com/v1',

  auth: {
    type: 'api-key' as AuthType.ApiKey,
    config: {
      headerName: 'Authorization',
      prefix: 'Bearer',
    },
  },

  actions: {
    // Create customer
    'customers.create': {
      name: 'customers.create',
      displayName: 'Create Customer',
      description: 'Create a new Stripe customer',

      parameters: z.object({
        email: z.string().email().describe('Customer email'),
        name: z.string().optional().describe('Customer name'),
        description: z.string().optional().describe('Customer description'),
        metadata: z.record(z.string()).optional().describe('Custom metadata'),
      }),

      returns: z.object({
        id: z.string(),
        email: z.string(),
        name: z.string().nullable(),
        created: z.number(),
      }),

      execute: async (params: any, context: ActionContext) => {
        const formData = new URLSearchParams({
          email: params.email,
          ...(params.name && { name: params.name }),
          ...(params.description && { description: params.description }),
        });
        for (const [key, value] of Object.entries(params.metadata ?? {})) {
          formData.append(`metadata[${key}]`, String(value));
        }
        const response = await context.http.post(
          `${context.provider.baseUrl}/customers`,
          formData.toString(),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          }
        );

        return response.data;
      },
    },

    // List customers
    'customers.list': {
      name: 'customers.list',
      displayName: 'List Customers',
      description: 'List all Stripe customers',
      idempotent: true,

      parameters: z.object({
        limit: z.number().optional().describe('Number of customers to return'),
        email: z.string().optional().describe('Filter by email'),
      }),

      returns: z.object({
        data: z.array(
          z.object({
            id: z.string(),
            email: z.string().nullable(),
            name: z.string().nullable(),
            created: z.number(),
          })
        ),
        has_more: z.boolean(),
      }),

      execute: async (params: any, context: ActionContext) => {
        const response = await context.http.get(`${context.provider.baseUrl}/customers`, {
          params: {
            limit: params.limit,
            email: params.email,
          },
        });

        return response.data;
      },
    },

    // Create payment intent
    'paymentIntents.create': {
      name: 'paymentIntents.create',
      displayName: 'Create Payment Intent',
      description: 'Create a new payment intent',

      parameters: z.object({
        amount: z.number().describe('Amount in cents'),
        currency: z.string().describe('Currency code (e.g., usd)'),
        customer: z.string().optional().describe('Customer ID'),
        description: z.string().optional().describe('Payment description'),
        metadata: z.record(z.string()).optional().describe('Custom metadata'),
      }),

      returns: z.object({
        id: z.string(),
        amount: z.number(),
        currency: z.string(),
        status: z.string(),
        client_secret: z.string(),
        created: z.number(),
      }),

      execute: async (params: any, context: ActionContext) => {
        const formData: any = {
          amount: params.amount.toString(),
          currency: params.currency,
        };

        if (params.customer) formData.customer = params.customer;
        if (params.description) formData.description = params.description;

        const response = await context.http.post(
          `${context.provider.baseUrl}/payment_intents`,
          new URLSearchParams(formData).toString(),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          }
        );

        return response.data;
      },
    },

    // Create subscription
    'subscriptions.create': {
      name: 'subscriptions.create',
      displayName: 'Create Subscription',
      description: 'Create a new subscription for a customer',

      parameters: z.object({
        customer: z.string().describe('Customer ID'),
        items: z
          .array(
            z.object({
              price: z.string().describe('Price ID'),
              quantity: z.number().optional().describe('Quantity'),
            })
          )
          .describe('Subscription items'),
        trial_days: z.number().optional().describe('Trial period in days'),
      }),

      returns: z.object({
        id: z.string(),
        customer: z.string(),
        status: z.string(),
        current_period_start: z.number(),
        current_period_end: z.number(),
      }),

      execute: async (params: any, context: ActionContext) => {
        const formData: any = {
          customer: params.customer,
        };

        params.items.forEach((item: any, index: any) => {
          formData[`items[${index}][price]`] = item.price;
          if (item.quantity) {
            formData[`items[${index}][quantity]`] = item.quantity.toString();
          }
        });

        if (params.trial_days) {
          formData.trial_period_days = params.trial_days.toString();
        }

        const response = await context.http.post(
          `${context.provider.baseUrl}/subscriptions`,
          new URLSearchParams(formData).toString(),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          }
        );

        return response.data;
      },
    },

    // Retrieve payment intent
    'paymentIntents.retrieve': {
      name: 'paymentIntents.retrieve',
      displayName: 'Retrieve Payment Intent',
      description: 'Retrieve a payment intent by ID',
      idempotent: true,

      parameters: z.object({
        id: z.string().describe('Payment intent ID'),
      }),

      returns: z.object({
        id: z.string(),
        amount: z.number(),
        currency: z.string(),
        status: z.string(),
        created: z.number(),
      }),

      execute: async (params: any, context: ActionContext) => {
        const response = await context.http.get(
          `${context.provider.baseUrl}/payment_intents/${params.id}`
        );

        return response.data;
      },
    },
  },

  triggers: {
    'payment_intent.succeeded': {
      name: 'payment_intent.succeeded',
      displayName: 'Payment Succeeded',
      description: 'Triggered when a payment intent succeeds',
      type: TriggerType.Webhook,

      webhookConfig: {
        path: '/webhooks/stripe/payment',
        method: 'POST',
        verifySignature: async (_payload, signature, secret, context) =>
          verifyStripeSignature(signature, secret, context),
      },

      schema: z.object({
        type: z.literal('payment_intent.succeeded'),
        data: z.object({
          object: z.object({
            id: z.string(),
            amount: z.number(),
            currency: z.string(),
            customer: z.string().nullable(),
            receipt_email: z.string().nullable(),
          }),
        }),
      }),

      handler: async (payload) => {
        return {
          event: 'payment_intent.succeeded',
          data: payload.data.object,
        };
      },
    },

    'customer.created': {
      name: 'customer.created',
      displayName: 'Customer Created',
      description: 'Triggered when a new customer is created',
      type: TriggerType.Webhook,

      webhookConfig: {
        path: '/webhooks/stripe/customer',
        method: 'POST',
        verifySignature: async (_payload, signature, secret, context) =>
          verifyStripeSignature(signature, secret, context),
      },

      schema: z.object({
        type: z.literal('customer.created'),
        data: z.object({
          object: z.object({
            id: z.string(),
            email: z.string(),
            name: z.string().nullable(),
            created: z.number(),
          }),
        }),
      }),

      handler: async (payload) => {
        return {
          event: 'customer.created',
          data: payload.data.object,
        };
      },
    },
  },

  rateLimit: {
    requests: 100,
    window: 1000, // 1 second
  },
};

function verifyStripeSignature(
  signature: string,
  secret: string,
  context: WebhookVerificationContext
): boolean {
  const rawBody = context.rawBody;
  if (!signature || !secret || !rawBody || rawBody.byteLength === 0) {
    return false;
  }

  const parts = signature.split(',').map((part) => part.trim().split('=', 2));
  const timestamp = parts.find(([key]) => key === 't')?.[1];
  const candidates = parts.filter(([key]) => key === 'v1').map(([, value]) => value);
  const timestampSeconds = Number(timestamp);
  if (
    !timestamp ||
    candidates.length === 0 ||
    !Number.isFinite(timestampSeconds) ||
    Math.abs(Date.now() / 1000 - timestampSeconds) > 300
  ) {
    return false;
  }

  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(Buffer.from(rawBody))
    .digest('hex');
  return candidates.some((candidate) => secureEqual(candidate, expected));
}

function secureEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}
