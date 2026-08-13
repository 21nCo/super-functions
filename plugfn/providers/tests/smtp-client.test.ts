import { afterEach, describe, expect, it, vi } from 'vitest';
import { SmtpClient } from '../src/imap-smtp/smtp-client.js';
import { getSmtpTransportMocks } from './setup.js';

const smtpTransportMocks = getSmtpTransportMocks();

describe('SMTP client', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('reports success only after the SMTP transport accepts the message', async () => {
    const client = new SmtpClient({
      host: 'smtp.example.com',
      port: 465,
      username: 'sender@example.com',
      password: 'secret',
      tls: true,
    });

    await expect(client.connect()).resolves.toMatchObject({ smtpConnected: true, tls: true });
    await expect(
      client.send({
        from: 'sender@example.com',
        to: ['recipient@example.com'],
        subject: 'Delivered message',
        bodyText: 'Hello',
      })
    ).resolves.toEqual({ queued: true, messageId: 'msg_delivered', tls: true });
    expect(smtpTransportMocks.verify).toHaveBeenCalledTimes(1);
    expect(smtpTransportMocks.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'sender@example.com',
        to: ['recipient@example.com'],
        subject: 'Delivered message',
      })
    );
  });

  it('does not synthesize success when SMTP delivery fails', async () => {
    smtpTransportMocks.sendMail.mockRejectedValueOnce(new Error('connection reset'));
    const client = new SmtpClient({
      host: 'smtp.example.com',
      username: 'sender@example.com',
      password: 'secret',
    });

    await expect(
      client.send({
        from: 'sender@example.com',
        to: ['recipient@example.com'],
        subject: 'Failed message',
        bodyText: 'Hello',
      })
    ).rejects.toMatchObject({
      code: 'PROVIDER_DELIVERY_FAILED',
      status: 502,
      message: 'smtp delivery failed',
    });
  });
});
