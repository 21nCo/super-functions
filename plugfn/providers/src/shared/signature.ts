import { createHmac, timingSafeEqual } from 'node:crypto';
import type { WebhookVerificationContext } from 'plugfn';

export interface VerifyRawBodyHmacInput {
  signature: string;
  secret: string;
  context: WebhookVerificationContext;
  algorithm?: 'sha1' | 'sha256';
  prefix?: string;
}

export function verifyRawBodyHmac(input: VerifyRawBodyHmacInput): boolean {
  if (!input.signature || !input.secret) {
    return false;
  }

  const rawBody = input.context.rawBody;
  if (!rawBody || rawBody.byteLength === 0) {
    return false;
  }

  const algorithm = input.algorithm ?? 'sha256';
  const prefix = input.prefix ?? `${algorithm}=`;
  const normalizedSignature = input.signature.startsWith(prefix)
    ? input.signature.slice(prefix.length)
    : input.signature;
  const expected = createHmac(algorithm, input.secret)
    .update(Buffer.from(rawBody))
    .digest('hex');

  const actualBuffer = Buffer.from(normalizedSignature, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer);
}
