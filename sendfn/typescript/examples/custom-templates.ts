import type { Adapter } from '@superfunctions/db';
import { awsSesAdapter, sendfn, type EmailTemplate } from '../src';

const database = {} as Adapter;

const invitationTemplate: EmailTemplate = {
  id: 'user-invitation',
  name: 'User Invitation',
  subject: "You've been invited to {{appName}}!",
  html: `
    <h1>Hi {{inviteeName}}!</h1>
    <p>{{inviterName}} invited you to join {{appName}}.</p>
    {{#if message}}
    <p><em>{{message}}</em></p>
    {{/if}}
    <p><a href="{{inviteUrl}}">Accept invitation</a></p>
  `,
  text: 'Hi {{inviteeName}}! {{inviterName}} invited you to join {{appName}}.',
  variables: ['inviteeName', 'inviterName', 'appName', 'inviteUrl'],
  metadata: {
    optionalVariables: ['message'],
  },
};

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
    },
  });

  await client.registerTemplate(invitationTemplate);

  return client.email({
    userId: 'user-123',
    to: 'newuser@example.com',
    templateId: 'user-invitation',
    templateData: {
      inviteeName: 'Jane',
      inviterName: 'John',
      appName: 'My App',
      inviteUrl: 'https://example.com/invite/abc123',
      message: 'I think you will love this app.',
    },
  });
}
