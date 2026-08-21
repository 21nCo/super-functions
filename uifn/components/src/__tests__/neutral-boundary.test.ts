import { describe, expect, it } from 'vitest';
import {
  STYLED_COMPONENT_CATALOG,
  STYLED_COMPONENT_COUNT,
  STYLED_PART_COUNT,
  UIFnStyledContractError,
  componentsPackage,
  createStyledPartRecipe,
} from '../index';

describe('@uifn/components neutral boundary', () => {
  it('identifies the framework-neutral stable package', () => {
    expect(componentsPackage).toEqual({
      name: '@uifn/components',
      layer: 'components-neutral',
      status: 'ga-candidate',
      styling: 'public-visual-defaults',
      behaviorOwner: '@uifn/core',
      sourcePolicy: 'clean-room',
    });
  });

  it('TV-COMP-001-P exposes exactly 69 open compounds and every canonical anatomy part', () => {
    expect(STYLED_COMPONENT_COUNT).toBe(69);
    expect(STYLED_PART_COUNT).toBe(465);
    expect(new Set(STYLED_COMPONENT_CATALOG.map((entry) => entry.id)).size).toBe(69);
    expect(createStyledPartRecipe('accordion', 'trigger', {
      state: 'open',
      className: 'consumer',
      classes: { trigger: 'consumer-part' },
      styles: { trigger: { paddingInline: '1rem' } },
    })).toEqual({
      className: 'uifn-accordion uifn-accordion__trigger consumer-part consumer',
      style: { paddingInline: '1rem' },
      vars: {},
      data: { 'data-uifn-component': 'accordion', 'data-uifn-part': 'trigger', 'data-state': 'open' },
      selector: '[data-uifn-component="accordion"][data-uifn-part="trigger"]',
    });
    expect(createStyledPartRecipe('button', 'root', {
      variant: 'danger',
      size: 'lg',
      density: 'compact',
    })).toMatchObject({
      className: 'uifn-button uifn-button__root uifn-button--danger uifn-button--lg uifn-button--density-compact',
      data: {
        'data-uifn-variant': 'danger',
        'data-uifn-size': 'lg',
        'data-uifn-density': 'compact',
      },
    });
    expect(createStyledPartRecipe('button', 'root', { unstyled: true, className: 'consumer' })).toMatchObject({
      className: 'consumer',
      data: { 'data-uifn-unstyled': 'true' },
    });
  });

  it('TV-COMP-001-N rejects unknown private parts', () => {
    expect(() => createStyledPartRecipe('accordion', 'private-runtime-part')).toThrowError(UIFnStyledContractError);
  });
});
