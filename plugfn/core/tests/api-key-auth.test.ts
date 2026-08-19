import { describe, expect, it } from 'vitest';
import { ApiKeyAuthHandler } from '../src/auth/api-key-auth.js';

describe('ApiKeyAuthHandler', () => {
  it('does not inject whitespace after assignment-style prefixes', () => {
    const handler = new ApiKeyAuthHandler({
      headerName: 'Authorization',
      prefix: 'Token token=',
    });

    expect(handler.addToHeaders({}, { type: 'api-key', apiKey: 'secret' })).toEqual({
      Authorization: 'Token token=secret',
    });
  });

  it('keeps a separator for word-style prefixes', () => {
    const handler = new ApiKeyAuthHandler({
      headerName: 'Authorization',
      prefix: 'Bearer',
    });

    expect(handler.addToHeaders({}, { type: 'api-key', apiKey: 'secret' })).toEqual({
      Authorization: 'Bearer secret',
    });
  });
});
