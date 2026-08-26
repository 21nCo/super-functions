import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Button, ButtonRoot, componentsSolidPackageBoundary } from './index';

describe('@uifn/components-solid', () => {
  it('TV-COMP-001-P exposes the generated one-to-one wrapper compound', () => {
    expect(typeof ButtonRoot).toBe('function');
    expect(Button.Root).toBe(ButtonRoot);
    expect(componentsSolidPackageBoundary).toMatchObject({
      componentCount: 69,
      partCount: 465,
      behaviorOwner: '@uifn/core',
      headlessOwner: '@uifn/solid',
      stylingOwner: '@uifn/components',
      styling: 'styled-open-compounds',
    });
  });

  it('forwards recipe names that are also semantic root inputs', () => {
    const badge = readFileSync(new URL('./generated/badge.ts', import.meta.url), 'utf8');
    const qrCode = readFileSync(new URL('./generated/qr-code.ts', import.meta.url), 'utf8');

    expect(badge).toContain("primitive === 'badge' ? { get variant()");
    expect(qrCode).toContain("primitive === 'qr-code' ? { get size()");
    expect(badge).toContain('mergeProps(rest, semanticProps');
  });
});
