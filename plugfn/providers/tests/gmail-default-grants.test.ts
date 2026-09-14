import { expect, it } from 'vitest';
import { gmailProvider, resolveGmailScopes } from '../src/gmail/index.js';
it('defaults to read/profile consent and requires explicit write grants', () => {
  expect((gmailProvider.auth.config as any).scopes).toEqual([
    'https://www.googleapis.com/auth/gmail.readonly', 'openid', 'email', 'profile'
  ]);
  expect(resolveGmailScopes(['mail.send'])).toEqual(['https://www.googleapis.com/auth/gmail.send']);
});
