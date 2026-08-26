import { describe, expect, it } from 'vitest';
import { AvatarContract } from './avatar';

describe('avatar static contract', () => {
  it('derives semantic image/fallback props without a controller lifecycle', () => {
    const parts = AvatarContract.getParts({ src: '/person.png', alt: 'Ada', status: 'loaded' }, { scopeId: 'profile' });
    expect(parts.image.attributes).toMatchObject({ src: '/person.png', alt: 'Ada' });
    expect(parts.image.hidden).toBe(false);
    expect(parts.fallback.hidden).toBe(true);
    expect('subscribe' in AvatarContract).toBe(false);
    expect('actions' in AvatarContract).toBe(false);
  });

  it('shows fallback deterministically for missing or failed images', () => {
    const state = AvatarContract.getState({ alt: 'Ada' });
    expect(state).toEqual({ status: 'error', showImage: false, showFallback: true });
  });
});
