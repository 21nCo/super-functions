import { MailFnError } from './errors.js';

const LOCAL_PART_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;
const MAILBOX_LOCAL_ATOM = "[a-z0-9!#$%&'*+/=?^_`{|}~-]+";
const MAILBOX_LOCAL_PART_PATTERN = new RegExp(`^${MAILBOX_LOCAL_ATOM}(?:\\.${MAILBOX_LOCAL_ATOM})*$`);
const DOMAIN_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function normalizeAddress(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized.length > 254) {
    throw invalidAddress();
  }
  const at = normalized.lastIndexOf('@');
  if (at <= 0 || at === normalized.length - 1) {
    throw invalidAddress();
  }
  const localPart = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  if (localPart.length > 64 || !MAILBOX_LOCAL_PART_PATTERN.test(localPart) || !DOMAIN_PATTERN.test(domain)) {
    throw invalidAddress();
  }
  return `${localPart}@${domain}`;
}

export function normalizeEnvelopeSender(value: string): string {
  const normalized = value.trim();
  return normalized === '' || normalized === '<>' ? '' : normalizeAddress(normalized);
}

export function normalizeDomain(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/\.$/, '');
  if (!DOMAIN_PATTERN.test(normalized)) {
    throw new MailFnError({
      code: 'MAILFN_VALIDATION_FAILED',
      message: 'Invalid mail domain',
      status: 400,
    });
  }
  return normalized;
}

export function normalizeLocalPart(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!LOCAL_PART_PATTERN.test(normalized)) {
    throw new MailFnError({
      code: 'MAILFN_VALIDATION_FAILED',
      message: 'Invalid inbox local part',
      status: 400,
    });
  }
  return normalized;
}

export function addressDomain(address: string): string {
  return normalizeAddress(address).split('@')[1] as string;
}

function invalidAddress(): MailFnError {
  return new MailFnError({
    code: 'MAILFN_VALIDATION_FAILED',
    message: 'Invalid email address',
    status: 400,
  });
}
