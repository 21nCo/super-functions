import { describe, expect, it } from 'vitest';
import { splitSvelteRootProps } from '../lib/internal/compound.js';

describe('splitSvelteRootProps', () => {
  it('forwards undeclared native attributes while retaining declared controller inputs', () => {
    expect(splitSvelteRootProps({
      open: true,
      pattern: '[0-9]+',
      maxlength: 8,
      inputmode: 'numeric',
      form: 'account-form',
      download: 'export.csv',
      accesskey: 'k',
      part: 'control',
      popover: 'manual',
      indeterminate: true,
      defaultChecked: true,
      aria: { label: 'Account code' },
      data: { state: 'ready' },
      on: { click: () => undefined },
    }, ['open'])).toMatchObject({
      inputs: { open: true, pattern: '[0-9]+', form: 'account-form' },
      dom: {
        pattern: '[0-9]+',
        maxlength: 8,
        inputmode: 'numeric',
        form: 'account-form',
        download: 'export.csv',
        accesskey: 'k',
        part: 'control',
        popover: 'manual',
        indeterminate: true,
        defaultChecked: true,
        aria: { label: 'Account code' },
        data: { state: 'ready' },
        on: { click: expect.any(Function) },
      },
    });
  });
});
