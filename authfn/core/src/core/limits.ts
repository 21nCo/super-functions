import { AuthFnValidationError } from './errors.js';

export const AUTHFN_DATABASE_KEY_MAX_LENGTH = 255;

export function assertAuthFnDatabaseKeyLength(value: string, fieldName: string): string {
  const length = Array.from(value).length;
  if (length > AUTHFN_DATABASE_KEY_MAX_LENGTH) {
    throw new AuthFnValidationError(
      `${fieldName} must contain at most ${AUTHFN_DATABASE_KEY_MAX_LENGTH} characters`,
      { fieldName, maxLength: AUTHFN_DATABASE_KEY_MAX_LENGTH, actualLength: length }
    );
  }
  return value;
}
