export const requiredMailProviderIds = [
  'forwarding',
  'gmail',
  'icloud',
  'imap-smtp',
  'managed-mail',
  'outlook',
  'yahoo',
] as const;

export function listRequiredMailProviderIds(): string[] {
  return [...requiredMailProviderIds];
}

export { githubProvider } from './github/index.js';
export { slackProvider } from './slack/index.js';
export { discordProvider } from './discord/index.js';
export { linearProvider } from './linear/index.js';
export { stripeProvider } from './stripe/index.js';
export { notionProvider } from './notion/index.js';
export { gmailProvider } from './gmail/index.js';
export { outlookProvider } from './outlook/index.js';
export { yahooProvider } from './yahoo/index.js';
export { icloudProvider } from './icloud/index.js';
export { imapSmtpProvider } from './imap-smtp/index.js';
export { forwardingProvider } from './forwarding/index.js';
export { managedMailProvider } from './managed-mail/index.js';
export { clickupProvider } from './clickup/index.js';
