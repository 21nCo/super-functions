import { vi } from 'vitest';

const smtpTransportMocks = vi.hoisted(() => ({
  verify: vi.fn(async () => true),
  sendMail: vi.fn(async () => ({
    messageId: 'msg_delivered',
    accepted: ['recipient@example.com'],
    rejected: [],
    pending: [],
  })),
}));

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => smtpTransportMocks),
  },
}));

export function getSmtpTransportMocks() {
  return smtpTransportMocks;
}
