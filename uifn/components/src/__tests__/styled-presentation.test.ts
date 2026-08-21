import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sourceStyles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const publicStyles = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');

describe('styled presentation contract', () => {
  it('publishes the exact source stylesheet', () => {
    expect(publicStyles).toBe(sourceStyles);
  });

  it('draws checkbox states without depending on a font glyph', () => {
    expect(sourceStyles).toContain('[data-uifn-component="checkbox"][data-uifn-part="indicator"]:not(:has(svg, img))');
    expect(sourceStyles).toContain('[data-state="indeterminate"]:not(:has(svg, img))');
    expect(sourceStyles).toContain('transform: rotate(45deg)');
  });

  it('makes switch direction and unavailable state explicit', () => {
    expect(sourceStyles).toContain('[dir="rtl"] [data-uifn-component="switch"]');
    expect(sourceStyles).toContain('transform: translateX(-1.25rem)');
    expect(sourceStyles).toContain('saturate(.45)');
  });

  it('uses selected tabs instead of rendering the raw indicator glyph', () => {
    expect(sourceStyles).toContain('[data-uifn-component="tabs"][data-uifn-part="trigger"][aria-selected="true"]');
    expect(sourceStyles).toMatch(/\[data-uifn-component="tabs"\]\[data-uifn-part="indicator"\][\s\S]*?clip-path: inset\(50%\)/);
  });

  it('distinguishes card surfaces and reserves a visible command search affordance', () => {
    expect(sourceStyles).toContain('[data-uifn-component="card"][data-uifn-part="root"][data-elevated]:not([data-elevated="false"])');
    expect(sourceStyles).toContain('[data-uifn-component="card"][data-uifn-part="root"][data-uifn-variant="outline"]');
    expect(sourceStyles).toContain('[data-uifn-component="card"][data-uifn-part="root"][data-uifn-density="spacious"]');
    expect(sourceStyles).toContain('[data-uifn-component="command"][data-uifn-part="root"])::before');
    expect(sourceStyles).toContain('[data-uifn-component="command"][data-uifn-part="input"]::placeholder');
  });

  it('places the standard backdrop filter after its prefixed fallback', () => {
    const prefixed = sourceStyles.indexOf('-webkit-backdrop-filter: blur(4px)');
    const standard = sourceStyles.indexOf('\n    backdrop-filter: blur(4px)');

    expect(prefixed).toBeGreaterThanOrEqual(0);
    expect(standard).toBeGreaterThan(prefixed);
  });

  it('sizes avatars through public UIFn size tokens', () => {
    expect(sourceStyles).toContain('--uifn-avatar-size: 4rem');
    expect(sourceStyles).toContain('inline-size: var(--uifn-avatar-size)');
    expect(sourceStyles).toContain('[data-uifn-size="sm"], [data-uifn-size="icon-sm"]');
    expect(sourceStyles).toContain('--uifn-avatar-size: var(--uifn-control-size-sm, 2rem)');
    expect(sourceStyles).toContain('--uifn-avatar-size: var(--uifn-control-size-md, 2.5rem)');
    expect(sourceStyles).toContain('--uifn-avatar-size: var(--uifn-control-size-lg, 3rem)');
  });

  it('positions every public Drawer side from the core data-side contract', () => {
    for (const side of ['left', 'top', 'right', 'bottom']) {
      expect(sourceStyles).toContain(`data-side="${side}"`);
    }
    expect(sourceStyles).toMatch(/part="positioner"\]\[data-side="left"\][\s\S]*?justify-content: flex-start/);
    expect(sourceStyles).toMatch(/part="positioner"\]\[data-side="bottom"\][\s\S]*?align-items: flex-end/);
    expect(sourceStyles).toMatch(/part="content"\]\[data-side="top"\][\s\S]*?border-block-end: 1px/);
    expect(sourceStyles).toMatch(/part="content"\]\[data-side="bottom"\][\s\S]*?border-block-start: 1px/);
  });
});
