import { describe, expect, it } from 'vitest';
import { STYLED_COMPONENT_CATALOG } from '@uifn/components';
import {
  catalogDemoFixtureDescription,
  catalogDemoFixtureIds,
  catalogDemoFixtureLabel,
  catalogDemoPartInstances,
  catalogDemoPartProps,
  catalogDemoPartText,
  catalogDemoRootPropsForRoute,
  catalogDemoSnippetRootProps,
  getCatalogComponentDemo,
} from '../component-demo.js';
import { workbenchComponents } from '../component-inventory.js';
import type { WorkbenchRoute } from '../routes.js';
import { catalogComponentCodeSnippet } from '../catalog-presentation.js';

const defaultRoute: WorkbenchRoute = {
  id: 'component-demo',
  path: '/components/component-demo',
  family: 'component',
  title: 'Component demo',
};

describe('catalog component demos', () => {
  it('provides one complete canonical public-package composition for every primitive', () => {
    expect(workbenchComponents).toHaveLength(69);
    for (const component of workbenchComponents) {
      const contract = STYLED_COMPONENT_CATALOG.find((entry) => entry.id === component.slug);
      const demo = getCatalogComponentDemo(component.slug);
      expect(contract, component.slug).toBeDefined();
      expect(demo.root.id, component.slug).toBe(contract?.parts[0]?.id);
      expect(
        [demo.root.id, ...demo.parts.map((part) => part.id)],
        component.slug,
      ).toEqual(contract?.parts.map((part) => part.id));
      expect(new Set(demo.parts.map((part) => part.exportName)).size, component.slug)
        .toBe(demo.parts.length);
      expect(
        demo.parts.every((part) => (
          part.parentId === demo.root.id
          || demo.parts.some((candidate) => candidate.id === part.parentId)
        )),
        component.slug,
      ).toBe(true);
    }
  });

  it('keeps every fixture topology acyclic and every repeated value addressable', () => {
    for (const component of workbenchComponents) {
      const demo = getCatalogComponentDemo(component.slug);
      const byId = new Map(demo.parts.map((part) => [part.id, part]));
      for (const part of demo.parts) {
        const ancestors = new Set<string>([part.id]);
        let parentId = part.parentId;
        while (parentId !== demo.root.id) {
          expect(ancestors.has(parentId), `${component.slug}.${part.id} parent cycle`).toBe(false);
          ancestors.add(parentId);
          const parent = byId.get(parentId);
          expect(parent, `${component.slug}.${part.id} missing parent ${parentId}`).toBeDefined();
          parentId = parent!.parentId;
        }

        const instances = catalogDemoPartInstances(part);
        expect(instances, `${component.slug}.${part.id}`).toHaveLength(Math.max(1, part.repeat));
        if (part.many) {
          expect(
            catalogDemoPartProps(component.slug, part, instances[0]!).value,
            `${component.slug}.${part.id} scoped value`,
          ).not.toBeUndefined();
        }
        if (part.many && part.repeat > 1) {
          const values = instances.map((index) => catalogDemoPartProps(component.slug, part, index).value);
          expect(
            new Set(values.map(String)).size,
            `${component.slug}.${part.id} repeated values`,
          ).toBe(values.length);
        }
      }
    }
  });

  it('adds safe native defaults for generated buttons and links', () => {
    for (const component of workbenchComponents) {
      const demo = getCatalogComponentDemo(component.slug);
      for (const part of demo.parts) {
        const props = catalogDemoPartProps(component.slug, part, 0);
        if (part.element === 'button') {
          expect(props.type, `${component.slug}.${part.id}`).toBe('button');
        }
        if (part.element === 'a') {
          expect(props.href, `${component.slug}.${part.id}`).toBe('#preview');
        }
      }
    }
  });

  it('provides live demo capabilities and semantically useful complex defaults', async () => {
    const clipboardProps = catalogDemoRootPropsForRoute('clipboard', defaultRoute);
    const fileUploadProps = catalogDemoRootPropsForRoute('file-upload', defaultRoute);
    const tagsProps = catalogDemoRootPropsForRoute('tags-input', defaultRoute);
    const treeProps = catalogDemoRootPropsForRoute('tree-view', defaultRoute);

    expect(clipboardProps.value).toContain('uifn component catalog');
    expect(typeof (clipboardProps.capability as { writeText?: unknown }).writeText).toBe('function');
    const picked = await (
      fileUploadProps.capability as { pick(): Promise<readonly { name: string }[]> }
    ).pick();
    expect(picked.map((file) => file.name)).toEqual(['roadmap.pdf', 'release-notes.txt']);
    expect(tagsProps.defaultValue).toEqual(['item-1', 'item-2']);
    expect(treeProps.items).toEqual([{
      id: 'item-1',
      textValue: 'Workspace',
      children: [{ id: 'item-2', textValue: 'Projects' }],
    }]);
  });

  it('uses curated public defaults instead of placeholder anatomy copy', () => {
    const angleProps = catalogDemoRootPropsForRoute('angle-slider', defaultRoute);
    const colorProps = catalogDemoRootPropsForRoute('color-picker', defaultRoute);
    const cropperProps = catalogDemoRootPropsForRoute('image-cropper', defaultRoute);
    const checkbox = getCatalogComponentDemo('checkbox');
    const colorPicker = getCatalogComponentDemo('color-picker');

    expect(angleProps.defaultValue).toBe(225);
    expect(colorProps).toMatchObject({ defaultValue: '#635bff', alpha: true });
    expect(colorProps).not.toHaveProperty('defaultOpen');
    expect(cropperProps.src).toBe('/components/crop-landscape.svg');
    expect(cropperProps).not.toHaveProperty('data-catalog-preview');
    expect(catalogDemoPartText(
      'checkbox',
      checkbox.parts.find((part) => part.id === 'label')!,
    )).toBe('Email notifications');
    expect(catalogDemoPartText(
      'checkbox',
      checkbox.parts.find((part) => part.id === 'indicator')!,
    )).toBe('');
    expect(catalogDemoPartText(
      'color-picker',
      colorPicker.parts.find((part) => part.id === 'content')!,
    )).toBe('');
    expect(cropperProps.environment).toEqual({
      scopeId: 'uifn-catalog-image-cropper-default',
      hydrationSeed: 'image-cropper-default',
    });
    expect(catalogDemoSnippetRootProps('image-cropper')).toEqual(
      Object.fromEntries(Object.entries(cropperProps).filter(([key]) => key !== 'environment')),
    );
  });

  it('maps styled pilot states to real props and readable documentation labels', () => {
    const loadingRoute: WorkbenchRoute = {
      ...defaultRoute,
      path: '/components/button/states',
      slug: 'button',
      fixtureId: 'loading',
    };
    const secondaryRoute: WorkbenchRoute = {
      ...loadingRoute,
      fixtureId: 'variant-secondary',
    };
    const iconRoute: WorkbenchRoute = {
      ...loadingRoute,
      fixtureId: 'icon-lg',
    };
    const dialogLongContentRoute: WorkbenchRoute = {
      ...loadingRoute,
      slug: 'dialog',
      fixtureId: 'long-content',
    };
    const mixedCheckboxRoute: WorkbenchRoute = {
      ...loadingRoute,
      slug: 'checkbox',
      fixtureId: 'mixed',
    };

    expect(catalogDemoRootPropsForRoute('button', loadingRoute)).toMatchObject({ loading: true });
    expect(catalogDemoRootPropsForRoute('button', secondaryRoute)).toMatchObject({ variant: 'secondary' });
    expect(catalogDemoRootPropsForRoute('button', defaultRoute)).not.toHaveProperty('aria-label');
    expect(catalogDemoRootPropsForRoute('button', iconRoute)).toMatchObject({
      size: 'icon-lg',
      'aria-label': 'Save changes',
    });
    expect(catalogDemoRootPropsForRoute('dialog', dialogLongContentRoute)).toMatchObject({ defaultOpen: true });
    expect(catalogDemoRootPropsForRoute('checkbox', mixedCheckboxRoute)).toMatchObject({ defaultChecked: 'indeterminate' });
    expect(catalogDemoFixtureLabel('variant-secondary')).toBe('Secondary');
    expect(catalogDemoFixtureLabel('density-spacious')).toBe('Spacious density');
    expect(catalogDemoFixtureDescription('button', 'loading')).toContain('disables repeated activation');
    expect(catalogDemoFixtureDescription('checkbox', 'mixed')).toContain('aria-checked="mixed"');
    expect(catalogDemoFixtureDescription('dialog', 'nested-overlay')).toContain('focus restoration');
    expect(catalogDemoFixtureIds('button', [])).not.toContain('variant-primary');
  });

  it('keeps published snippets free of generator placeholder copy', () => {
    const placeholderCopy = /Component content|Example label|Example title|First option|Second option|Unavailable option|\b(?:branch|control|field|group|indicator|item|root|track|viewport) example\b/i;
    for (const component of workbenchComponents) {
      for (const framework of ['react', 'svelte', 'solid'] as const) {
        expect(
          catalogComponentCodeSnippet(component.slug, framework),
          `${framework}.${component.slug}`,
        ).not.toMatch(placeholderCopy);
      }
    }
  });
});
