import { describe, expect, it } from 'vitest';

import { extractOtp } from './extraction.js';
import type { Message } from './types.js';

function message(htmlBody: string): Message {
  return {
    id: 'msg_1',
    receivedAt: '2026-08-29T00:00:00.000Z',
    subject: '',
    textBody: '',
    htmlBody,
  } as Message;
}

describe('verification extraction markup handling', () => {
  it('ignores script and style contents, including spaced closing tags', () => {
    const result = extractOtp(message([
      '<script type="text/javascript">verification code 111111</script >',
      '<style>verification code 222222</style >',
      '<p>verification code 654321</p>',
    ].join('')));

    expect(result?.value).toBe('654321');
  });

  it('does not extract from an unclosed executable block', () => {
    expect(extractOtp(message('<script>verification code 111111'))).toBeNull();
  });

  it('extracts bounded contextual and generic digit runs', () => {
    expect(extractOtp(message('<p>Your login PIN is 4321.</p>'))?.value).toBe('4321');
    expect(extractOtp(message('<p>Reference 987654 is ready.</p>'))?.value).toBe('987654');
    expect(extractOtp(message('<p>Login 12345678901</p>'))).toBeNull();
  });

  it('honors quoted angle brackets while scanning tag boundaries', () => {
    expect(extractOtp(message('<p title="1 > 0">verification code 246810</p>'))?.value).toBe('246810');
    expect(extractOtp(message('<script data-close="</script>">verification code 111111</script><p>login 135790</p>'))?.value).toBe('135790');
  });
});
