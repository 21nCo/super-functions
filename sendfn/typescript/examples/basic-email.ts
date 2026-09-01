import type { Adapter } from '@superfunctions/db';
import { awsSesAdapter, sendfn } from '../src';

// Replace this placeholder with your shared @superfunctions/db adapter.
const database = {} as Adapter;

export async function main() {
  const client = sendfn({
    database,
    emailProvider: awsSesAdapter({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'YOUR_ACCESS_KEY_ID',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'YOUR_SECRET_ACCESS_KEY',
      region: 'us-east-1',
    }),
    email: {
      fromEmail: 'noreply@example.com',
      fromName: 'My App',
      replyTo: 'support@example.com',
    },
  });

  const transaction = await client.email({
    userId: 'user-123',
    to: 'recipient@example.com',
    subject: 'Welcome to My App!',
    html: '<h1>Welcome!</h1><p>Thanks for joining My App.</p>',
    text: 'Welcome! Thanks for joining My App.',
  });

  const events = await client.getEmailEvents(transaction.id);
  return { transaction, events };
}
