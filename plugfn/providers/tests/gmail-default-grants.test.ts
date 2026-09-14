import { expect, it } from 'vitest';
import { gmailProvider } from '../src/gmail/index.js';
it('includes every selected action grant in default OAuth scopes', () => {
  const scopes = (gmailProvider.auth.config as any).scopes;
  for (const action of Object.values(gmailProvider.actions)) {
    for (const scope of action.contract?.requiredScopes ?? []) expect(scopes).toContain(scope);
  }
});
