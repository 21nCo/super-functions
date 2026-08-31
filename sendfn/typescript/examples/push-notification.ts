import type { Adapter } from '@superfunctions/db';
import { apnsAdapter, sendfn } from '../src';

const database = {} as Adapter;
const rawServiceAccountKey = process.env.FCM_SERVICE_ACCOUNT_JSON;

if (!rawServiceAccountKey) {
  throw new Error('Set FCM_SERVICE_ACCOUNT_JSON to the full Firebase service account JSON before running this example.');
}

const serviceAccountKey = JSON.parse(rawServiceAccountKey) as object;
const apnsPrivateKey = process.env.APNS_PRIVATE_KEY;

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} before enabling the APNS example.`);
  return value;
}

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
    pushProviders: apnsPrivateKey
      ? {
          ios: apnsAdapter({
            bundleId: requiredEnvironment('APNS_BUNDLE_ID'),
            key: apnsPrivateKey,
            keyId: requiredEnvironment('APNS_KEY_ID'),
            production: process.env.APNS_PRODUCTION === 'true',
            teamId: requiredEnvironment('APNS_TEAM_ID'),
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
