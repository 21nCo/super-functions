import type { Adapter } from '@superfunctions/db';
import { apnsAdapter, sendfn } from '../src';

const database = {} as Adapter;
const rawServiceAccountKey = process.env.FCM_SERVICE_ACCOUNT_JSON;

if (!rawServiceAccountKey) {
  throw new Error('Set FCM_SERVICE_ACCOUNT_JSON to the full Firebase service account JSON before running this example.');
}

const serviceAccountKey = JSON.parse(rawServiceAccountKey) as object;

export async function main() {
  const client = sendfn({
    database,
    push: {
      providers: {
        fcm: {
          serviceAccountKey,
        },
      },
    },
    pushProviders: process.env.APNS_PRIVATE_KEY
      ? {
          ios: apnsAdapter({
            bundleId: process.env.APNS_BUNDLE_ID,
            key: process.env.APNS_PRIVATE_KEY,
            keyId: process.env.APNS_KEY_ID!,
            production: process.env.APNS_PRODUCTION === 'true',
            teamId: process.env.APNS_TEAM_ID!,
          }),
        }
      : undefined,
  });

  await client.registerDevice({
    userId: 'user-123',
    token: 'fcm-device-token',
    platform: 'android',
    appVersion: '1.0.0',
  });

  const notification = await client.push({
    userId: 'user-123',
    title: 'Alert',
    body: 'Something happened.',
    data: {
      screen: 'inbox',
    },
  });

  const devices = await client.getDevices('user-123');
  return { notification, devices };
}
