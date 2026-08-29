import type { Adapter } from '@superfunctions/db';
import { sendfn } from '../src';

const database = {} as Adapter;
const adminKey = process.env.SENDFN_ADMIN_KEY;

if (!adminKey) {
  throw new Error('Set SENDFN_ADMIN_KEY before running this example.');
}

export async function main() {
  const client = sendfn({
    database,
    enableApi: true,
    apiConfig: {
      adminKey,
    },
  });

  const webhookHandler = client.getWebhookHandlers().awsSes;
  const events = await client.queryEvents({
    provider: 'aws-ses',
    limit: 20,
  });

  return {
    router: client.router,
    webhookHandler,
    events,
  };
}
