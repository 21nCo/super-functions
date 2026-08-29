import { describe, expect, it } from 'vitest';

import { MailFnClient } from './index.js';

describe('mailfn facade', () => {
  it('exports the high-level client entry point', () => {
    expect(MailFnClient).toBeTypeOf('function');
  });
});
