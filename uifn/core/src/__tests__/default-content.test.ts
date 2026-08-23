import { describe, expect, it } from 'vitest';
import { resolveUIFnDefaultPartContent } from '../parts';

describe('default core part content', () => {
  it('projects the selected Select item text without adding styling', () => {
    expect(resolveUIFnDefaultPartContent('Select', 'valueText', {
      selectedKeys: ['admin'],
      items: [
        { id: 'member', textValue: 'Member' },
        { id: 'admin', textValue: 'Administrator' },
      ],
    })).toBe('Administrator');
  });

  it('projects QR geometry as an unstyled SVG path descriptor', () => {
    expect(resolveUIFnDefaultPartContent('QRCode', 'image', {
      path: 'M4 4h1v1h-1z',
    })).toEqual({
      kind: 'svg-path',
      d: 'M4 4h1v1h-1z',
    });
  });

  it('does not invent content for unrelated primitives or parts', () => {
    expect(resolveUIFnDefaultPartContent('Select', 'itemText', {})).toBeUndefined();
    expect(resolveUIFnDefaultPartContent('Dialog', 'title', {})).toBeUndefined();
  });
});
