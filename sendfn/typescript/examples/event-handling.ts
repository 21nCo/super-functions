import type { Adapter } from '@superfunctions/db';
import { sendfn } from '../src';

const database = {} as Adapter;
const adminKey = process.env.SENDFN_ADMIN_KEY;
const awsSnsTopicArn = process.env.AWS_SNS_TOPIC_ARN;

if (!adminKey || !awsSnsTopicArn) {
  throw new Error('Set SENDFN_ADMIN_KEY and AWS_SNS_TOPIC_ARN before running this example.');
}

export async function main() {
  const client = sendfn({
    database,
    enableApi: true,
    apiConfig: {
      adminKey,
    },
    awsSns: {
      topicArns: [awsSnsTopicArn],
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
