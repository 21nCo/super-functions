import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BadgeRoot, Button, ButtonRoot, QRCodeImage, QRCodeRoot, componentsReactPackageBoundary } from './index';

describe('@uifn/components-react', () => {
  it('TV-COMP-001-P wraps public headless parts without owning behavior', () => {
    const html = renderToStaticMarkup(React.createElement(ButtonRoot, { className: 'consumer', children: 'Save' }));
    expect(html).toContain('data-uifn-component="button"');
    expect(html).toContain('data-uifn-part="root"');
    expect(html).toContain('class="uifn-button uifn-button__root consumer"');
    expect(Button.Root).toBe(ButtonRoot);
    expect(componentsReactPackageBoundary).toMatchObject({
      componentCount: 69,
      partCount: 465,
      behaviorOwner: '@uifn/core',
      headlessOwner: '@uifn/react',
      stylingOwner: '@uifn/components',
      styling: 'styled-open-compounds',
    });
  });

  it('consumes public recipes for variants, sizing, density, overrides, and unstyled escape hatches', () => {
    const html = renderToStaticMarkup(React.createElement(ButtonRoot, {
      variant: 'danger',
      size: 'lg',
      density: 'compact',
      classes: { root: 'consumer-root' },
      styles: { root: { paddingInline: '1rem' } },
      children: 'Delete',
    }));
    expect(html).toContain('data-uifn-variant="danger"');
    expect(html).toContain('data-uifn-size="lg"');
    expect(html).toContain('data-uifn-density="compact"');
    expect(html).toContain('uifn-button--danger');
    expect(html).toContain('consumer-root');
    expect(html).toContain('padding-inline:1rem');

    const unstyled = renderToStaticMarkup(React.createElement(ButtonRoot, {
      unstyled: true,
      className: 'consumer-only',
      children: 'Own styles',
    }));
    expect(unstyled).toContain('data-uifn-unstyled="true"');
    expect(unstyled).toContain('class="consumer-only"');
    expect(unstyled).not.toContain('uifn-button__root');
  });

  it('forwards styled props that are also semantic headless inputs', () => {
    const badge = renderToStaticMarkup(React.createElement(BadgeRoot, {
      variant: 'success',
      children: 'Healthy',
    }));
    expect(badge).toContain('data-variant="success"');
    expect(badge).toContain('data-uifn-variant="success"');

    const qrCode = renderToStaticMarkup(React.createElement(QRCodeRoot, {
      value: 'https://uifn.dev',
      label: 'UIFn website',
      size: 176,
      children: React.createElement(QRCodeImage),
    }));
    expect(qrCode).toContain('width="176"');
    expect(qrCode).toContain('height="176"');
  });
});
