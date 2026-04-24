import { describe, expect, it } from 'vitest';
import {
  AuthValidationError,
  assertValidAuthSession,
  assertValidAuthSubject,
  isAuthSession,
  isAuthSubject,
} from '../types.js';

describe('auth type guards', () => {
  it('accepts actor-centric auth subjects and sessions', () => {
    const subject = {
      actorId: 'user_01',
      actorType: 'user',
      regionId: 'eu-west-1',
      email: 'ada@example.com',
    };
    const session = {
      id: 'sess_01',
      type: 'session',
      subject,
      methods: ['password'],
    };

    expect(isAuthSubject(subject)).toBe(true);
    expect(isAuthSession(session)).toBe(true);
    expect(() => assertValidAuthSubject(subject)).not.toThrow();
    expect(() => assertValidAuthSession(session)).not.toThrow();
  });

  it('rejects subjects missing actor type with AUTH_VALIDATION_ERROR', () => {
    const invalidSubject = {
      actorId: 'user_01',
    };

    expect(isAuthSubject(invalidSubject)).toBe(false);
    expect(() => assertValidAuthSubject(invalidSubject)).toThrowError(AuthValidationError);

    try {
      assertValidAuthSession({
        id: 'sess_01',
        type: 'session',
        subject: invalidSubject,
      });
      throw new Error('Expected auth validation error');
    } catch (error) {
      expect(error).toBeInstanceOf(AuthValidationError);
      expect(error).toMatchObject({
        code: 'AUTH_VALIDATION_ERROR',
        statusCode: 400,
      });
    }
  });
});
