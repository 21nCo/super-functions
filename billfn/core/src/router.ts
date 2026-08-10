import { createRouter, type Route } from '@superfunctions/http';
import { createBillFnError } from './errors.js';
import { errorResponse, jsonResponse, successResponse } from './http.js';
import { normalizeBasePath, resolveRequestSubject } from './helpers.js';
import { createBillFnService } from './service.js';
import type { BillFnConfig, BillableSubject } from './types.js';

async function parseJsonBody<T>(request: Request): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw createBillFnError({
      code: 'BILLFN_VALIDATION_ERROR',
      message: 'Request body must contain valid JSON'
    });
  }

  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw createBillFnError({
      code: 'BILLFN_VALIDATION_ERROR',
      message: 'Request body must contain a JSON object'
    });
  }

  return body as T;
}

export function createBillFnRouter(config: BillFnConfig) {
  const service = createBillFnService(config);
  const ensureOperationsAuthorized = async (request: Request) => {
    const authorized = await (config.operations?.authorize?.(request) ?? false);
    if (!authorized) {
      throw createBillFnError({
        code: 'BILLFN_UNAUTHORIZED',
        message: 'Operations access is not authorized'
      });
    }
  };
  const routes: Route[] = [
    {
      method: 'GET',
      path: '/status',
      handler: async () =>
        successResponse({
          ok: true,
          version: 1,
          namespace: service.namespace,
          providers: Object.keys(config.providers ?? {}),
          capabilities: [
            'catalog.read',
            'checkout.create',
            'checkout.verify',
            'subscription.cancel',
            'subscription.change',
            'subscription.resume',
            'subscription.refund',
            'subscription.sync',
            'purchase.restore',
            'entitlements.read',
            'usage.read',
            'webhook.ingest',
            'ops.reconciliation'
          ]
        })
    },
    {
      method: 'GET',
      path: '/catalog',
      handler: async () => successResponse(await service.getCatalog())
    },
    {
      method: 'GET',
      path: '/entitlements',
      handler: async (request) => {
        const subject = await resolveRequestSubject(request, config.auth?.resolveSubject);
        const response = await service.getEntitlements(subject);
        if (!response.ok) {
          return jsonResponse(response, response.error.status);
        }
        return successResponse(response.data);
      }
    },
    {
      method: 'GET',
      path: '/usage',
      handler: async (request, context) => {
        const subject = await resolveRequestSubject(request, config.auth?.resolveSubject);
        const resource = context.query.get('resource') ?? undefined;
        const response = await service.getUsage(subject, resource);
        if (!response.ok) {
          return jsonResponse(response, response.error.status);
        }
        return successResponse(response.data);
      }
    },
    {
      method: 'POST',
      path: '/checkouts',
      handler: async (request) => {
        const body = await parseJsonBody<{
          subject?: BillableSubject;
          planKey: string;
          provider: string;
          interval?: string;
          metadata?: Record<string, unknown>;
          customer?: {
            email?: string;
            name?: string;
            billing?: Record<string, unknown>;
          };
          returnUrl?: string;
          successUrl?: string;
          cancelUrl?: string;
        }>(request);
        const subject = await resolveRequestSubject(request, config.auth?.resolveSubject, body.subject);
        const response = await service.createCheckout({
          subject,
          planKey: body.planKey,
          provider: body.provider as never,
          interval: body.interval as never,
          metadata: body.metadata,
          customer: body.customer,
          returnUrl: body.returnUrl,
          successUrl: body.successUrl,
          cancelUrl: body.cancelUrl
        });
        if (!response.ok) {
          return jsonResponse(response, response.error.status);
        }
        return successResponse(response.data, 201);
      }
    },
    {
      method: 'POST',
      path: '/checkouts/verify',
      handler: async (request) => {
        const body = await parseJsonBody<{
          subject?: BillableSubject;
          checkoutSessionId: string;
          payload?: Record<string, unknown>;
        }>(request);
        const subject = await resolveRequestSubject(request, config.auth?.resolveSubject, body.subject);
        const response = await service.verifyCheckout({
          subject,
          checkoutSessionId: body.checkoutSessionId,
          payload: body.payload
        });
        if (!response.ok) {
          return jsonResponse(response, response.error.status);
        }
        return successResponse(response.data);
      }
    },
    {
      method: 'POST',
      path: '/subscriptions/cancel',
      handler: async (request) => {
        const body = await parseJsonBody<{
          subject?: BillableSubject;
          subscriptionId?: string;
          reason?: string;
        }>(request);
        const subject = await resolveRequestSubject(request, config.auth?.resolveSubject, body.subject);
        const response = await service.cancelSubscription({
          subject,
          subscriptionId: body.subscriptionId,
          reason: body.reason
        });
        if (!response.ok) {
          return jsonResponse(response, response.error.status);
        }
        return successResponse(response.data);
      }
    },
    {
      method: 'POST',
      path: '/subscriptions/change',
      handler: async (request) => {
        const body = await parseJsonBody<{
          subject?: BillableSubject;
          subscriptionId?: string;
          targetPriceId: string;
          effectiveAt?: 'immediate' | 'next_renewal';
          prorationBehavior?: 'provider_default' | 'prorate' | 'none';
          reason?: string;
        }>(request);
        const subject = await resolveRequestSubject(request, config.auth?.resolveSubject, body.subject);
        const response = await service.changeSubscription({
          subject,
          subscriptionId: body.subscriptionId,
          targetPriceId: body.targetPriceId,
          effectiveAt: body.effectiveAt,
          prorationBehavior: body.prorationBehavior,
          reason: body.reason
        });
        if (!response.ok) {
          return jsonResponse(response, response.error.status);
        }
        return successResponse(response.data);
      }
    },
    {
      method: 'POST',
      path: '/subscriptions/resume',
      handler: async (request) => {
        const body = await parseJsonBody<{
          subject?: BillableSubject;
          subscriptionId?: string;
        }>(request);
        const subject = await resolveRequestSubject(request, config.auth?.resolveSubject, body.subject);
        const response = await service.resumeSubscription({
          subject,
          subscriptionId: body.subscriptionId
        });
        if (!response.ok) {
          return jsonResponse(response, response.error.status);
        }
        return successResponse(response.data);
      }
    },
    {
      method: 'POST',
      path: '/subscriptions/refund',
      handler: async (request) => {
        const body = await parseJsonBody<{
          subject?: BillableSubject;
          subscriptionId?: string;
          providerChargeId?: string;
          mode?: 'full' | 'prorated_remaining_period' | 'custom';
          amount?: number;
          reason?: string;
        }>(request);
        const subject = await resolveRequestSubject(request, config.auth?.resolveSubject, body.subject);
        const response = await service.refundCharge({
          subject,
          subscriptionId: body.subscriptionId,
          providerChargeId: body.providerChargeId,
          mode: body.mode,
          amount: body.amount,
          reason: body.reason
        });
        if (!response.ok) {
          return jsonResponse(response, response.error.status);
        }
        return successResponse(response.data);
      }
    },
    {
      method: 'POST',
      path: '/subscriptions/sync',
      handler: async (request) => {
        const body = await parseJsonBody<{
          subject?: BillableSubject;
          subscriptionId?: string;
        }>(request);
        const subject = await resolveRequestSubject(request, config.auth?.resolveSubject, body.subject);
        const response = await service.syncSubscription({
          subject,
          subscriptionId: body.subscriptionId
        });
        if (!response.ok) {
          return jsonResponse(response, response.error.status);
        }
        return successResponse(response.data);
      }
    },
    {
      method: 'POST',
      path: '/purchases/restore',
      handler: async (request) => {
        const body = await parseJsonBody<{
          subject?: BillableSubject;
          planKey: string;
          provider: string;
          priceId?: string;
          purchaseReference: string;
          payload?: Record<string, unknown>;
        }>(request);
        const subject = await resolveRequestSubject(request, config.auth?.resolveSubject, body.subject);
        const response = await service.restorePurchases({
          subject,
          planKey: body.planKey,
          provider: body.provider as never,
          priceId: body.priceId,
          purchaseReference: body.purchaseReference,
          payload: body.payload
        });
        if (!response.ok) {
          return jsonResponse(response, response.error.status);
        }
        return successResponse(response.data);
      }
    },
    {
      method: 'POST',
      path: '/webhooks/:provider',
      handler: async (request, context) => {
        const rawBody = await request.text();
        const response = await service.handleWebhook({
          provider: context.params.provider as never,
          rawBody,
          headers: request.headers
        });
        if (!response.ok) {
          return jsonResponse(response, response.error.status);
        }
        return successResponse(response.data);
      }
    },
    {
      method: 'POST',
      path: '/ops/reconciliation/jobs',
      handler: async (request) => {
        await ensureOperationsAuthorized(request);
        const body = await parseJsonBody<{
          kind: 'webhook-event' | 'subscription-sync' | 'account-scan' | 'notification-history-backfill' | 'webhook-replay';
          provider?: string;
          billingAccountId?: string;
          subscriptionId?: string;
          providerEventId?: string;
          cursor?: string;
          payload?: Record<string, unknown>;
        }>(request);
        const response = await service.enqueueReconciliationJob({
          kind: body.kind,
          provider: body.provider as never,
          billingAccountId: body.billingAccountId,
          subscriptionId: body.subscriptionId,
          providerEventId: body.providerEventId,
          cursor: body.cursor,
          payload: body.payload
        });
        if (!response.ok) {
          return jsonResponse(response, response.error.status);
        }
        return successResponse(response.data, 201);
      }
    },
    {
      method: 'GET',
      path: '/ops/reconciliation/jobs/:jobId',
      handler: async (request, context) => {
        await ensureOperationsAuthorized(request);
        const response = await service.getReconciliationJob({
          jobId: context.params.jobId
        });
        if (!response.ok) {
          return jsonResponse(response, response.error.status);
        }
        return successResponse(response.data);
      }
    },
    {
      method: 'POST',
      path: '/ops/reconciliation/jobs/:jobId/run',
      handler: async (request, context) => {
        await ensureOperationsAuthorized(request);
        const response = await service.runReconciliationJob({
          jobId: context.params.jobId
        });
        if (!response.ok) {
          return jsonResponse(response, response.error.status);
        }
        return successResponse(response.data);
      }
    }
  ];

  return createRouter({
    basePath: normalizeBasePath(config.basePath, '/billfn'),
    routes,
    onError: async (error) => errorResponse(error)
  });
}
