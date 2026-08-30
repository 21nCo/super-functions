# Sendfn TypeScript SDK

The `sendfn` SDK is a unified communications platform that provides email, SMS, WhatsApp, and push notification capabilities. It follows the Superfunctions pattern, utilizing shared database and HTTP abstractions with a modular adapter system for providers.

## Features

- **Unified API**: Send emails, SMS, WhatsApp messages, and push notifications through a single interface.
- **Adapter-Based Providers**: Inject your preferred providers (for example AWS SES for email, Meta WhatsApp Cloud API for WhatsApp, APNS/FCM for push, and the shipped console SMS adapter for development).
- **Built-in API Router**: Optional REST API endpoints for remote management.
- **Template Engine**: Lightweight engine with default templates (Welcome, Password Reset, etc.).
- **Suppression Management**: Built-in handling for email bounces and complaints.
- **Database Agnostic**: Uses `@superfunctions/db` adapters (Drizzle, Prisma, Kysely, etc.).

## Installation

```bash
npm install sendfn @superfunctions/db @superfunctions/http
```

## Verify From Repo Root

```bash
npm install
npm run build --workspace sendfn/typescript
npm run lint --workspace sendfn/typescript
npm test --workspace sendfn/typescript -- --run
```

Inside the package itself you can also run:

```bash
npm run release:verify
```

## Quick Start

### 1. Initialize the Client

```typescript
import { sendfn, awsSesAdapter, consoleSmsAdapter } from 'sendfn';
import { apnsAdapter } from 'sendfn/adapters/apns';
import { metaWhatsAppAdapter } from 'sendfn/adapters/meta-whatsapp';
import type { Adapter } from '@superfunctions/db';

// 1. Setup your shared database adapter.
// Replace this placeholder with drizzle/prisma/kysely/etc from @superfunctions/db.
const database = {} as Adapter;

const whatsappAccessToken = process.env.WHATSAPP_ACCESS_TOKEN;
const whatsappPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

if (!whatsappAccessToken || !whatsappPhoneNumberId) {
  throw new Error(
    'WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID are required',
  );
}

// 2. Initialize sendfn with desired providers
const client = sendfn({
  database,
  emailProvider: awsSesAdapter({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    region: 'us-east-1',
  }),
  smsProvider: consoleSmsAdapter(), // Logs SMS to console for development
  whatsappProvider: metaWhatsAppAdapter({
    accessToken: whatsappAccessToken,
    phoneNumberId: whatsappPhoneNumberId,
  }),
  pushProviders: {
    ios: apnsAdapter({
      keyId: process.env.APNS_KEY_ID!,
      teamId: process.env.APNS_TEAM_ID!,
      key: process.env.APNS_PRIVATE_KEY!,
      bundleId: 'com.example.app',
      production: false,
    }),
  },
  email: {
    fromEmail: 'noreply@yourdomain.com',
    fromName: 'SuperFunctions App',
  },
  enableApi: true,
  apiConfig: {
    adminKey: process.env.SENDFN_ADMIN_KEY,
  },
});
```

### 2. Use the API Router

If `enableApi` is true, the `client.router` instance is available to be mounted on any supported framework via Superfunctions HTTP adapters.

```typescript
import { createExpressApp } from '@superfunctions/http-express';

const app = createExpressApp(client.router);
app.listen(3000);

// Endpoints (Requires 'Authorization: Bearer <adminKey>'):
// POST /email - Send an email
// POST /sms   - Send an SMS
// POST /whatsapp - Send a WhatsApp message
// POST /push             - Send a push notification
// POST /devices          - Register a native/web device token
// GET  /devices          - List active device tokens for a user
// POST /devices/refresh  - Refresh a native/web device token
// DELETE /devices        - Deactivate a device token
// GET  /events           - Query communication events
// POST /webhooks/aws-ses - Process verified SES lifecycle events
```

## Configuration

```typescript
interface SendfnConfig {
  database: Adapter;           // From @superfunctions/db
  emailProvider?: EmailProvider; // e.g., awsSesAdapter()
  smsProvider?: SmsProvider;     // e.g., consoleSmsAdapter()
  whatsappProvider?: WhatsAppProvider; // e.g., metaWhatsAppAdapter()
  email?: EmailConfig;         // Default settings (fromEmail, fromName)
  pushProviders?: Partial<Record<Platform, PushProvider>>; // APNS/FCM/custom adapters
  push?: PushConfig;           // Legacy credentials for FCM/APNS
  options?: {
    suppressionEnabled?: boolean; // default: true
    eventTracking?: boolean;      // default: true
  };
  enableApi?: boolean;            // default: false
  apiConfig?: {
    adminKey?: string;           // Required if enableApi is true
  };
}
```

## Usage Guide

### Sending Email

```typescript
await client.email({
  userId: 'user-123',
  to: 'user@example.com',
  subject: 'Hello',
  html: '<strong>Welcome to Superfunctions!</strong>',
});
```

### Sending SMS

```typescript
await client.sms({
  userId: 'user-123',
  to: '+1234567890',
  message: 'Your verification code is 554433',
});
```

### Sending WhatsApp Messages

```typescript
await client.whatsapp({
  userId: 'user-123',
  to: '+1234567890',
  message: 'Your reminder is due',
});
```

### Sending Push Notifications

```typescript
// Register a device token for a user
await client.registerDevice({
  userId: 'user-123',
  token: 'apns-token-xyz',
  platform: 'ios',
});

// Send push to all active devices of the user
await client.push({
  userId: 'user-123',
  title: 'Alert',
  body: 'Something happened!',
});
```

### AWS SES Webhooks

To handle bounces and complaints automatically, authorize every SNS topic that may deliver SES lifecycle events when constructing the client. SendFn does not expose the handler or built-in route with an empty allowlist.

```typescript
const client = sendfn({
  database,
  awsSns: {
    topicArns: ['arn:aws:sns:us-east-1:123456789012:sendfn-production'],
  },
});
```

Then mount the webhook handler. Preserve the raw SNS envelope JSON exactly as AWS sends it; production deployments must keep the full SNS signature fields intact so the webhook handler can perform signature verification before any delivery, bounce, or complaint event mutates state.

```typescript
app.post('/webhooks/aws-ses', async (req, res) => {
  const handler = client.getWebhookHandlers().awsSes;
  // req.body should be the SNS notification JSON
  await handler.handleSnsNotification(req.body);
  res.sendStatus(200);
});
```

Do not proxy, partially parse, or reshape the SNS payload before passing it to `handleSnsNotification`.

## Examples

- `examples/basic-email.ts`
- `examples/custom-templates.ts`
- `examples/push-notification.ts`
- `examples/event-handling.ts`

## Database Schema

The database adapter expects the following models to be present in your database:

- `email_transactions`
- `sms_transactions`
- `whatsapp_transactions`
- `push_notifications`
- `device_tokens`
- `suppression_list`
- `communication_events`

## License

MIT
