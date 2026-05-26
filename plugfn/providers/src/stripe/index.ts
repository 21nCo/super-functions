import { z } from 'zod';
import type { Provider } from 'plugfn';
import { AuthType } from 'plugfn';
import { TriggerType } from 'plugfn';
import type { ActionContext } from 'plugfn';
import { verifyRawBodyHmac } from '../shared/signature.js';

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
        const response = await context.http.post(
          `${context.provider.baseUrl}/customers`,
          new URLSearchParams({
            email: params.email,
            ...(params.name && { name: params.name }),
            ...(params.description && { description: params.description }),
          }).toString(),
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
          verifyRawBodyHmac({ signature, secret, context, algorithm: 'sha256', prefix: '' }),
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
