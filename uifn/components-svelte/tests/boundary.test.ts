import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('@uifn/components-svelte package boundary', () => {
  it('keeps styling in the styled layer and behavior in the headless/core layers', () => {
    const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

    expect(source).toContain("componentCount: 69");
    expect(source).toContain("partCount: 465");
    expect(source).toContain("behaviorOwner: '@uifn/core'");
    expect(source).toContain("headlessOwner: '@uifn/svelte'");
    expect(source).toContain("stylingOwner: '@uifn/components'");
    expect(source).toContain("styling: 'styled-open-compounds'");
  });

  it('generates Svelte parts from the same public recipe contract', () => {
    const source = readFileSync(new URL('../src/generated/button/ButtonRoot.svelte', import.meta.url), 'utf8');
    expect(source).toContain('openComponentPartRecipe');
    expect(source).toContain('variant?: StyledVariant');
    expect(source).toContain('unstyled?: boolean');
    expect(source).toContain('{...recipe.data}');
  });

  it('forwards recipe names that are also semantic root inputs', () => {
    const badge = readFileSync(new URL('../src/generated/badge/BadgeRoot.svelte', import.meta.url), 'utf8');
    const qrCode = readFileSync(new URL('../src/generated/qr-code/QRCodeRoot.svelte', import.meta.url), 'utf8');

    expect(badge).toContain('const semanticProps');
    expect(badge).toContain('variant,');
    expect(qrCode).toContain('const semanticProps');
    expect(qrCode).toContain('size,');
  });
});
