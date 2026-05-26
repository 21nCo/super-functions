import { describe, expect, it } from 'vitest';
import { isHydratedGmailApiMessage } from '../src/gmail/index.js';

describe('isHydratedGmailApiMessage', () => {
  it('treats list summaries as needing hydration', () => {
    expect(isHydratedGmailApiMessage({ id: 'msg-1' })).toBe(false);
    expect(isHydratedGmailApiMessage({ id: 'msg-1', threadId: 'thread-1' })).toBe(false);
  });

  it('accepts hydrated Gmail API messages', () => {
    expect(
      isHydratedGmailApiMessage({
        id: 'msg-1',
        snippet: 'Hello world',
      })
    ).toBe(true);

    expect(
      isHydratedGmailApiMessage({
        id: 'msg-1',
        internalDate: '1710201600000',
      })
    ).toBe(true);

    expect(
      isHydratedGmailApiMessage({
        id: 'msg-1',
        payload: {
          headers: [{ name: 'Subject', value: 'Test' }],
        },
      })
    ).toBe(true);
  });
});
