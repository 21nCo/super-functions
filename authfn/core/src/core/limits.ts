import { AuthFnValidationError } from './errors.js';

export const AUTHFN_DATABASE_KEY_MAX_LENGTH = 255;

export function assertAuthFnDatabaseKeyLength(
  value: string,
  fieldName: string,
  maxLength: number = AUTHFN_DATABASE_KEY_MAX_LENGTH
): string {
  const length = Array.from(value).length;
  if (length > maxLength) {
    throw new AuthFnValidationError(
      `${fieldName} must contain at most ${maxLength} characters`,
      { fieldName, maxLength, actualLength: length }
    );
  }
  return value;
}
