import { issueSessionCookies } from './cookies.js';
import { AuthFnInternalError } from './errors.js';
import type { IssuedSession } from './sessions.js';

export type AuthFnSessionResponseMode = 'cookie' | 'bearer' | 'hybrid';

export function buildSessionResponse(
  issued: IssuedSession,
  modeInput: AuthFnSessionResponseMode | undefined
): {
  data: {
    session: IssuedSession['session'];
    token?: string;
  };
  setCookies: string[];
} {
  const mode = modeInput === 'bearer' || modeInput === 'hybrid' ? modeInput : 'cookie';
  const setCookies = mode === 'bearer'
    ? []
    : Object.values(issueSessionCookies(requireCookiePolicy(issued), issued.sessionToken, issued.csrfToken));

  return {
    data: {
      session: issued.session,
      ...(mode === 'bearer' || mode === 'hybrid' ? { token: issued.sessionToken } : {})
    },
    setCookies
  };
}

function requireCookiePolicy(issued: IssuedSession): NonNullable<IssuedSession['cookiePolicy']> {
  if (!issued.cookiePolicy) {
    throw new AuthFnInternalError('Session cookie policy is unavailable for cookie session response');
  }
  return issued.cookiePolicy;
}
