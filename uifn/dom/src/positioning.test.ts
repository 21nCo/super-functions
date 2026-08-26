import { describe, expect, it } from 'vitest';
import { createUIFnPointAnchor } from './positioning';

describe('createUIFnPointAnchor', () => {
  it('creates a stable zero-area virtual reference without reading the DOM', () => {
    const anchor = createUIFnPointAnchor(12.5, 40);
    expect(anchor.getBoundingClientRect().toJSON()).toEqual({
      x: 12.5,
      y: 40,
      top: 40,
      right: 12.5,
      bottom: 40,
      left: 12.5,
      width: 0,
      height: 0,
    });
  });
});
