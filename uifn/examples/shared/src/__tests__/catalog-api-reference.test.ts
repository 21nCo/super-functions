import { STYLED_COMPONENT_CATALOG } from '@uifn/components';
import { describe, expect, it } from 'vitest';
import {
  catalogComponentDetailsHtml,
  type CatalogFramework,
} from '../catalog-presentation.js';

const frameworks: readonly CatalogFramework[] = ['react', 'svelte', 'solid'];

describe('catalog API reference completeness', () => {
  it('publishes complete machine-readable API metadata for every component', () => {
    expect(STYLED_COMPONENT_CATALOG).toHaveLength(69);

    for (const component of STYLED_COMPONENT_CATALOG) {
      const api = component.api;
      expect(api.rootProps, `${component.id} root props`).toHaveLength(component.inputs.length);
      expect(
        api.rootProps.every((input) => input.defaultValue.length > 0 && input.description.length > 0),
        `${component.id} documented input defaults`,
      ).toBe(true);
      expect(
        api.events.every((event) => (
          event.signature.startsWith('{ type: "')
          && event.signature.endsWith(' }')
          && event.description.length > 0
        )),
        `${component.id} complete event signatures`,
      ).toBe(true);
      expect(api.parts, `${component.id} per-part API`).toHaveLength(component.parts.length);
      expect(
        api.parts.every((part) => (
          part.exportName.length > 0
          && part.element.length > 0
          && frameworks.every((framework) => part.sharedProps[framework].length > 0)
        )),
        `${component.id} framework part props`,
      ).toBe(true);
      expect(api.ownership.core, `${component.id} controller ownership`).toMatch(/^@uifn\/core\//);
      expect(Object.keys(api.ownership.contexts), `${component.id} contexts`).toEqual(frameworks);
      expect(api.dataAttributes.some((attribute) => attribute.name === 'data-uifn-component')).toBe(true);
      expect(api.dataAttributes.some((attribute) => attribute.name === 'data-uifn-part')).toBe(true);
      expect(api.cssVariables.length, `${component.id} CSS variables`).toBeGreaterThan(0);
      expect(api.limitations.length, `${component.id} limitations`).toBeGreaterThan(0);
    }
  });

  it('renders the full API surface into every framework documentation page', () => {
    for (const component of STYLED_COMPONENT_CATALOG) {
      for (const framework of frameworks) {
        const html = catalogComponentDetailsHtml(component.id, framework, `/components/${framework}`);
        expect(html, `${framework}.${component.id} events`).toContain('data-catalog-doc-events');
        expect(html, `${framework}.${component.id} parts`).toContain('data-catalog-doc-parts');
        expect(html, `${framework}.${component.id} styling`).toContain('data-catalog-doc-styling-api');
        expect(html, `${framework}.${component.id} limitations`).toContain('data-catalog-doc-limitations');
        expect(
          html.match(/data-catalog-part-api=/g) ?? [],
          `${framework}.${component.id} rendered per-part rows`,
        ).toHaveLength(component.parts.length);
      }
    }
  });

  it('documents canonical non-false overlay defaults accurately', () => {
    const expected = {
      'alert-dialog.restoreFocus': 'undefined → true',
      'dialog.modal': 'undefined → true',
      'dialog.restoreFocus': 'undefined → true',
      'drawer.modal': 'undefined → true',
      'tour.modal': 'undefined → true',
    } as const;

    for (const [key, defaultValue] of Object.entries(expected)) {
      const [componentId, propName] = key.split('.');
      const component = STYLED_COMPONENT_CATALOG.find((candidate) => candidate.id === componentId);
      const prop = component?.api.rootProps.find((candidate) => candidate.name === propName);
      expect(prop?.defaultValue, key).toBe(defaultValue);
    }
  });
});
