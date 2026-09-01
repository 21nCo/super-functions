import { describe, expect, it } from 'vitest';

import { normalizeAddress, normalizeDomain, normalizeEnvelopeSender, normalizeLocalPart } from './address.js';

describe('MailFn address normalization', () => {
  it('normalizes safe unique-address inputs', () => {
    expect(normalizeAddress('  Signup.Run-7@Inbound.Example.com ')).toBe('signup.run-7@inbound.example.com');
    expect(normalizeDomain('Inbound.Example.com.')).toBe('inbound.example.com');
    expect(normalizeLocalPart('Agent_42')).toBe('agent_42');
  });

  it.each(['missing-at', '@example.com', 'a@localhost', '../a@example.com'])('rejects unsupported input %s', (value) => {
    expect(() => normalizeAddress(value)).toThrow('Invalid email address');
  });

  it('accepts RFC mailbox tags and the SMTP null reverse path', () => {
    expect(normalizeAddress('Agent+tag@example.com')).toBe('agent+tag@example.com');
    expect(normalizeEnvelopeSender('<>')).toBe('');
    expect(normalizeEnvelopeSender('')).toBe('');
  });

  it('rejects normalized mailboxes beyond the SMTP length limit', () => {
    const local = 'a'.repeat(64);
    const domain = `${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(58)}.com`;
    expect(() => normalizeAddress(`${local}@${domain}`)).toThrow('Invalid email address');
  });
});
