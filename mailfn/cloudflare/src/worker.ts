import {
  createAesGcmSecretProtector,
  MailFn,
  MailFnError,
  type MailFnSendAdapter,
  type ParseJob,
  type PublicPlatformPolicy,
} from '@mailfn/core';

import type {
  D1Database,
  ExecutionContext,
  ForwardableEmailMessage,
  Queue,
  QueueBatch,
  R2Bucket,
} from './bindings.js';
import { D1MailFnStore } from './d1-store.js';
import { CloudflareDomainAdapter } from './domain.js';
import { createMailFnHttpHandler } from './http.js';
import { PostalMimeParser } from './mime.js';
import { applyMailFnMigrations } from './migrations.js';
import { R2MailFnObjectStore } from './object-store.js';
import { CloudflareMailFnQueue } from './queue.js';
import { CloudflareWebhookDispatcher, cloudflareFetchResolved } from './webhook.js';

export interface MailFnCloudflareEnv {
  MAILFN_DB: D1Database;
  MAILFN_OBJECTS: R2Bucket;
  MAILFN_PARSE_QUEUE: Queue<ParseJob>;
  MAILFN_DOMAIN: string;
  MAILFN_SECRET_KEY: string;
  MAILFN_ADMIN_TOKEN?: string;
  MAILFN_PROJECT_ID?: string;
  MAILFN_CORS_ORIGINS?: string;
  MAILFN_PUBLIC_PLATFORM_ENABLED?: string;
  MAILFN_PRODUCTION_SECURITY_APPROVED?: string;
  MAILFN_BILLING_ENABLED?: string;
  MAILFN_SUPPORT_ENABLED?: string;
  MAILFN_PROTOCOL_SERVICES_ENABLED?: string;
  MAILFN_ALLOWED_DATA_REGIONS?: string;
  /** Region of the D1/R2 bindings attached to this deployment. */
  MAILFN_STORAGE_REGION?: string;
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_ZONE_ID?: string;
  CLOUDFLARE_ZONE_NAME?: string;
  MAILFN_EMAIL_WORKER_NAME?: string;
}

export interface MailFnCloudflareFactoryOptions {
  sendAdapter?: MailFnSendAdapter;
  migrate?: boolean;
}

export async function createCloudflareMailFn(
  env: MailFnCloudflareEnv,
  options: MailFnCloudflareFactoryOptions = {},
): Promise<MailFn> {
  if (options.migrate !== false) await applyMailFnMigrations(env.MAILFN_DB);
  const secretProtector = createAesGcmSecretProtector(await importSecretKey(env.MAILFN_SECRET_KEY));
  const storageRegion = env.MAILFN_STORAGE_REGION?.trim() || 'global';
  const configuredRegions = env.MAILFN_ALLOWED_DATA_REGIONS?.split(',').map((entry) => entry.trim()).filter(Boolean) ?? [storageRegion];
  if (configuredRegions.some((region) => region !== storageRegion)) {
    throw new Error('MAILFN_REGION_BINDING_MISMATCH');
  }
  const publicPlatform: Partial<PublicPlatformPolicy> = {
    enabled: flag(env.MAILFN_PUBLIC_PLATFORM_ENABLED),
    productionSecurityApproved: flag(env.MAILFN_PRODUCTION_SECURITY_APPROVED),
    billingEnabled: flag(env.MAILFN_BILLING_ENABLED),
    supportEnabled: flag(env.MAILFN_SUPPORT_ENABLED),
    protocolServicesEnabled: flag(env.MAILFN_PROTOCOL_SERVICES_ENABLED),
    allowedDataRegions: [storageRegion],
  };
  const domainAdapter = env.CLOUDFLARE_API_TOKEN && env.CLOUDFLARE_ZONE_ID && env.CLOUDFLARE_ZONE_NAME && env.MAILFN_EMAIL_WORKER_NAME
    ? new CloudflareDomainAdapter({
        apiToken: env.CLOUDFLARE_API_TOKEN,
        zoneId: env.CLOUDFLARE_ZONE_ID,
        zoneName: env.CLOUDFLARE_ZONE_NAME,
        workerName: env.MAILFN_EMAIL_WORKER_NAME,
      })
    : undefined;
  return new MailFn({
    store: new D1MailFnStore(env.MAILFN_DB),
    objects: new R2MailFnObjectStore(env.MAILFN_OBJECTS),
    queue: new CloudflareMailFnQueue(env.MAILFN_PARSE_QUEUE),
    mimeParser: new PostalMimeParser(),
    webhookDispatcher: new CloudflareWebhookDispatcher({ fetchResolved: cloudflareFetchResolved, maxAttempts: 1 }),
    secretProtector,
    defaultDomain: env.MAILFN_DOMAIN,
    sendAdapter: options.sendAdapter,
    domainAdapter,
    publicPlatform,
  });
}

export function createMailFnCloudflareHandlers(options: MailFnCloudflareFactoryOptions = {}) {
  return {
    async fetch(request: Request, env: MailFnCloudflareEnv): Promise<Response> {
      const mailfn = await createCloudflareMailFn(env, options);
      return createMailFnHttpHandler({
        mailfn,
        adminToken: env.MAILFN_ADMIN_TOKEN,
        adminProjectId: env.MAILFN_PROJECT_ID,
        corsOrigins: env.MAILFN_CORS_ORIGINS?.split(',').map((entry) => entry.trim()).filter(Boolean),
      })(request);
    },

    async email(message: ForwardableEmailMessage, env: MailFnCloudflareEnv, _ctx: ExecutionContext): Promise<void> {
      const mailfn = await createCloudflareMailFn(env, options);
      let preflight: Awaited<ReturnType<MailFn['preflightInbound']>> | undefined;
      try {
        preflight = await mailfn.preflightInbound({
          envelopeFrom: message.from,
          envelopeTo: message.to,
          rawSize: message.rawSize,
        });
        const raw = new Uint8Array(await new Response(message.raw).arrayBuffer());
        await mailfn.receiveInbound({
          providerDeliveryId: await deriveCloudflareDeliveryId(message.from, message.to, raw),
          envelopeFrom: message.from,
          envelopeTo: message.to,
          raw,
          rawSize: message.rawSize,
          headers: headersRecord(message.headers),
          authenticationResults: parseCloudflareAuthenticationResults(message.headers.get('authentication-results')),
        }, preflight);
      } catch (error) {
        if (preflight) await mailfn.cancelInbound(preflight);
        if (error instanceof MailFnError && permanentInboundFailure(error)) {
          message.setReject(smtpReason(error));
          return;
        }
        throw error;
      }
    },

    async queue(batch: QueueBatch<ParseJob>, env: MailFnCloudflareEnv): Promise<void> {
      const mailfn = await createCloudflareMailFn(env, options);
      for (const message of batch.messages) {
        try {
          await mailfn.parseMessage({ ...message.body, attempt: message.attempts });
          message.ack();
        } catch (error) {
          const retryable = !(error instanceof MailFnError) || error.retryable;
          if (retryable) message.retry({ delaySeconds: Math.min(300, 2 ** Math.min(8, message.attempts)) });
          else message.ack();
        }
      }
    },

    async scheduled(_event: unknown, env: MailFnCloudflareEnv, ctx: ExecutionContext): Promise<void> {
      const mailfn = await createCloudflareMailFn(env, options);
      ctx.waitUntil(Promise.all([
        mailfn.runRetention(env.MAILFN_PROJECT_ID),
        mailfn.retryPendingMessages(env.MAILFN_PROJECT_ID),
        mailfn.retryWebhookDeliveries(env.MAILFN_PROJECT_ID),
      ]).then(() => undefined));
    },
  };
}

export async function deriveCloudflareDeliveryId(
  envelopeFrom: string,
  envelopeTo: string,
  raw: Uint8Array,
): Promise<string> {
  const envelope = new TextEncoder().encode(`${envelopeFrom.trim().toLowerCase()}\0${envelopeTo.trim().toLowerCase()}\0`);
  const evidence = new Uint8Array(envelope.byteLength + raw.byteLength);
  evidence.set(envelope);
  evidence.set(raw, envelope.byteLength);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', evidence));
  return `cf_sha256_${Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

async function importSecretKey(value: string): Promise<CryptoKey> {
  const bytes = /^[a-f0-9]{64}$/i.test(value)
    ? Uint8Array.from(value.match(/.{2}/g) ?? [], (part) => Number.parseInt(part, 16))
    : fromBase64(value);
  if (bytes.byteLength !== 32) throw new Error('MAILFN_SECRET_KEY_MUST_BE_32_BYTES');
  const keyBytes = Uint8Array.from(bytes);
  return globalThis.crypto.subtle.importKey('raw', keyBytes.buffer, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

function fromBase64(value: string): Uint8Array {
  const decoded = globalThis.atob(value);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

function flag(value?: string): boolean {
  return value === '1' || value?.toLowerCase() === 'true';
}

function headersRecord(headers: Headers): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  headers.forEach((value, key) => { (result[key.toLowerCase()] ??= []).push(value); });
  return result;
}

export function parseCloudflareAuthenticationResults(value: string | null) {
  if (!value) return undefined;
  const find = (mechanism: string) => {
    const clauses = value.split(';').map((clause) => clause.trim());
    const matches = clauses.flatMap((clause) => {
      const match = new RegExp(`^${mechanism}=([a-z_-]+)\\b`, 'i').exec(clause);
      return match ? [{ clause, result: match[1]!.toLowerCase() }] : [];
    });
    if (mechanism === 'spf') {
      return matches.find(({ clause }) => /\bsmtp\.mailfrom=/i.test(clause))?.result
        ?? matches.find(({ clause }) => /\bsmtp\.helo=/i.test(clause))?.result
        ?? matches[0]?.result;
    }
    return matches[0]?.result;
  };
  return { raw: value, spf: find('spf'), dkim: find('dkim'), dmarc: find('dmarc'), arc: find('arc') };
}

export function permanentInboundFailure(error: MailFnError): boolean {
  if (error.retryable) return false;
  return [
    'MAILFN_UNKNOWN_RECIPIENT',
    'MAILFN_INBOX_INACTIVE',
    'MAILFN_MESSAGE_TOO_LARGE',
    'MAILFN_SENDER_BLOCKED',
    'MAILFN_QUOTA_EXCEEDED',
    'MAILFN_VALIDATION_FAILED',
  ].includes(error.code);
}

function smtpReason(error: MailFnError): string {
  if (error.code === 'MAILFN_MESSAGE_TOO_LARGE') return 'Message exceeds recipient size policy';
  if (error.code === 'MAILFN_RATE_LIMITED' || error.code === 'MAILFN_QUOTA_EXCEEDED') return 'Recipient policy limit exceeded';
  return 'Recipient unavailable';
}
