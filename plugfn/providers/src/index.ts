export const requiredMailProviderIds = [
  'gmail',
  'icloud',
  'imap-smtp',
  'outlook',
  'yahoo',
] as const;

export function listRequiredMailProviderIds(): string[] {
  return [...requiredMailProviderIds];
}

export { githubProvider } from './github/index.js';
export { slackProvider, slackUserProvider } from './slack/index.js';
export { discordProvider } from './discord/index.js';
export { linearProvider } from './linear/index.js';
export { stripeProvider } from './stripe/index.js';
export { notionProvider } from './notion/index.js';
export { gmailProvider } from './gmail/index.js';
export { outlookProvider } from './outlook/index.js';
export { yahooProvider } from './yahoo/index.js';
export { icloudProvider } from './icloud/index.js';
export { imapSmtpProvider } from './imap-smtp/index.js';
export { clickupProvider } from './clickup/index.js';
export { googleDriveProvider } from './google-drive/index.js';
export { googleDocsProvider } from './google-docs/index.js';
export { googleSheetsProvider } from './google-sheets/index.js';
export { googleCalendarProvider } from './google-calendar/index.js';
export { jiraProvider } from './jira/index.js';
export { onedriveProvider } from './onedrive/index.js';
