import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { generateDocs } from '../generate-docs';
import { buildCompatibilityPanel } from '../panel';
import { UIFN_STORYBOOK_DECORATORS, uifnStorybookPreset } from '../preset';
import {
  evaluateStoryCheckResults,
  inspectStorySource,
  reconcileBuiltStoryIds,
  validateStories,
} from '../validate-stories';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

describe('@uifn/storybook public workbench', () => {
  it('requires a real renderer and the complete global preference matrix', () => {
    expect(uifnStorybookPreset.parameters.uifn).toEqual({
      requiredForReleaseValidation: true,
      metadataOnlyAccepted: false,
    });
    expect(UIFN_STORYBOOK_DECORATORS).toEqual([
      'theme', 'density', 'locale', 'direction', 'viewport', 'a11y', 'forced-colors', 'reduced-motion',
    ]);
  });

  it('builds current compatibility metadata from the signed registry catalog', () => {
    expect(buildCompatibilityPanel({ slug: 'button', repoRoot })).toMatchObject({
      name: 'Button',
      version: '0.0.1',
      canonicalVersion: '1.0.0',
      status: 'ga-candidate',
      frameworks: ['react', 'svelte', 'solid'],
      sourcePolicy: 'clean-room',
      certification: 'semantic-parity-complete-external-compatibility-pending',
    });
  });

  it('maps every canonical field and section to generated documentation', () => {
    const docs = generateDocs(repoRoot);
    expect(docs.ok).toBe(true);
    expect(docs.primitiveCount).toBe(69);
    expect(docs.requiredSectionCount).toBe(69 * 13);
    expect(docs.mappedFieldCount).toBe(12_368);
    expect(docs.sampleCount).toBe(69 * 3 * 2);
    expect(docs.pages.find((page) => page.primitive === 'button')).toMatchObject({
      requiredSections: expect.arrayContaining(['accessibility', 'package-install', 'source-install']),
      sampleIds: expect.arrayContaining(['button-react-package', 'button-svelte-source', 'button-solid-package']),
    });
  });

  it('validates all 2,115 generated public-package stories', () => {
    expect(validateStories(repoRoot)).toMatchObject({
      ok: true,
      storyCount: 2115,
      primitiveCount: 69,
      frameworkCount: 3,
      sourceModuleCount: 207,
      errors: [],
    });
  });

  it('kills missing-story and static-test-double mutations with stable codes', () => {
    expect(reconcileBuiltStoryIds(['stable-dialog--default'], [])).toEqual([
      expect.objectContaining({ code: 'UIFN_STORY_MISSING', story: 'stable-dialog--default' }),
    ]);
    expect(inspectStorySource(
      `const meta = { component: 'div' }; export const Default = { render: () => <div /> };`,
      { primitive: 'dialog', framework: 'react', publicImport: '@uifn/components-react/dialog' },
    )).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'UIFN_STORY_NOT_PUBLIC_COMPONENT' })]));
  });

  it('maps browser check failures to release-blocking story errors', () => {
    expect(evaluateStoryCheckResults({ interaction: true, a11y: true, visual: true })).toEqual({ ok: true });
    expect(evaluateStoryCheckResults({ a11y: false })).toEqual({
      ok: false,
      error: { code: 'UIFN_STORY_A11Y_FAILED', message: 'A11y story check failed' },
    });
  });
});
