import {
  STYLED_COMPONENT_CATALOG,
} from '@uifn/components';
import type { UifnQaContract, UifnQaFixture, UifnQaProfile } from './qa-contract.js';
import { workbenchFrameworks, workbenchThemes } from './qa-contract.js';

export type ComponentSlug = (typeof STYLED_COMPONENT_CATALOG)[number]['id'];

export const expectedComponentSlugs: ComponentSlug[] = STYLED_COMPONENT_CATALOG.map(
  (component) => component.id,
);

export interface WorkbenchComponentDefinition {
  family: 'component';
  name: string;
  slug: ComponentSlug;
  displayName: string;
  category: string;
  profiles: UifnQaProfile[];
  states: string[];
  anatomy: string[];
  variants: string[];
  sizes: string[];
  behaviors: string[];
}

const overlayComponents = new Set<ComponentSlug>([
  'alert-dialog',
  'autocomplete',
  'color-picker',
  'combobox',
  'command',
  'context-menu',
  'date-picker',
  'dialog',
  'drawer',
  'floating-panel',
  'hover-card',
  'menu',
  'menubar',
  'navigation-menu',
  'popover',
  'select',
  'tooltip',
  'tour',
]);

const formComponents = new Set<ComponentSlug>([
  'angle-slider',
  'autocomplete',
  'checkbox',
  'checkbox-group',
  'color-picker',
  'combobox',
  'date-input',
  'date-picker',
  'editable',
  'field',
  'fieldset',
  'file-upload',
  'form',
  'input',
  'input-group',
  'listbox',
  'number-input',
  'password-input',
  'pin-input',
  'radio-group',
  'rating-group',
  'segment-group',
  'select',
  'signature-pad',
  'slider',
  'switch',
  'tags-input',
  'textarea',
]);

const navigationComponents = new Set<ComponentSlug>([
  'accordion',
  'breadcrumb',
  'carousel',
  'context-menu',
  'listbox',
  'menu',
  'menubar',
  'navigation-menu',
  'pagination',
  'steps',
  'tabs',
  'toolbar',
  'tree-view',
  'command',
]);

const feedbackComponents = new Set<ComponentSlug>([
  'meter',
  'progress',
  'qr-code',
  'timer',
  'toast',
  'skeleton',
]);

const layoutComponents = new Set<ComponentSlug>([
  'avatar',
  'card',
  'input-group',
  'marquee',
  'scroll-area',
  'separator',
  'splitter',
  'table',
]);

const dataRichComponents = new Set<ComponentSlug>([
  'carousel',
  'command',
  'color-picker',
  'file-upload',
  'image-cropper',
  'tags-input',
  'tree-view',
  'table',
]);

function profilesForSlug(slug: ComponentSlug): UifnQaProfile[] {
  const profiles: UifnQaProfile[] = [];
  if (formComponents.has(slug)) profiles.push('form');
  if (overlayComponents.has(slug)) profiles.push('overlay');
  if (navigationComponents.has(slug)) profiles.push('navigation');
  if (feedbackComponents.has(slug)) profiles.push('feedback');
  if (layoutComponents.has(slug)) profiles.push('layout');
  if (dataRichComponents.has(slug)) profiles.push('data-rich');
  if (!profiles.length) profiles.push(['avatar', 'badge', 'marquee', 'meter', 'progress', 'qr-code', 'separator'].includes(slug) ? 'static' : 'control');
  return profiles;
}

function categoryForProfiles(profiles: UifnQaProfile[]): string {
  if (profiles.includes('form')) return 'Form';
  if (profiles.includes('overlay')) return 'Overlay';
  if (profiles.includes('navigation')) return 'Navigation';
  if (profiles.includes('feedback')) return 'Feedback';
  if (profiles.includes('data-rich')) return 'Data-rich';
  if (profiles.includes('layout')) return 'Layout';
  if (profiles.includes('static')) return 'Display';
  return 'Control';
}

const defaultStatesByProfile: Record<UifnQaProfile, string[]> = {
  static: ['default'],
  control: ['default', 'disabled', 'active'],
  form: ['default', 'disabled', 'invalid'],
  overlay: ['closed', 'open'],
  navigation: ['default', 'active'],
  feedback: ['default', 'loading', 'success', 'error'],
  layout: ['default', 'responsive'],
  'data-rich': ['default', 'loading', 'empty', 'error', 'large-data'],
  typography: ['default', 'responsive'],
};

const interactionsByProfile: Record<UifnQaProfile, string[]> = {
  static: ['inspect-rendered-output'],
  control: ['click', 'keyboard'],
  form: ['type', 'keyboard', 'submit'],
  overlay: ['click-or-hover-trigger', 'escape-key', 'outside-click', 'tab'],
  navigation: ['keyboard', 'route-link'],
  feedback: ['dismiss', 'status-region'],
  layout: ['resize-viewport', 'scroll'],
  'data-rich': ['filter', 'sort-or-select', 'keyboard', 'scroll'],
  typography: ['resize-viewport'],
};

const interactionOverrides = new Map<ComponentSlug, string[]>([
  ['table', ['inspect-semantic-structure', 'keyboard', 'scroll', 'resize-viewport']],
]);

function interactionsForComponent(slug: ComponentSlug, profiles: UifnQaProfile[]): string[] {
  return interactionOverrides.get(slug) ?? unique(profiles.flatMap((profile) => interactionsByProfile[profile]));
}

const geometryByProfile: Record<UifnQaProfile, string[]> = {
  static: ['visible-box', 'no-clipping'],
  control: ['visible-box', 'focus-ring-visible'],
  form: ['visible-box', 'label-association'],
  overlay: [
    'default-placement',
    'top-left',
    'top-right',
    'bottom-left',
    'bottom-right',
    'mobile',
    'scroll-container',
    'overflow-clipping',
    'transformed-parent',
    'long-content',
    'nested-overlay',
    'rtl',
  ],
  navigation: ['visible-box', 'active-item-visible'],
  feedback: ['visible-box', 'status-region-visible'],
  layout: ['responsive-box', 'no-clipping'],
  'data-rich': ['large-data-window', 'no-clipping', 'responsive-box'],
  typography: ['text-wrap', 'no-overlap'],
};

const overlayFixtureCases = [
  { id: 'default-placement', geometry: 'default-placement' },
  { id: 'edge-top-left', geometry: 'top-left' },
  { id: 'edge-top-right', geometry: 'top-right' },
  { id: 'edge-bottom-left', geometry: 'bottom-left' },
  { id: 'edge-bottom-right', geometry: 'bottom-right' },
  { id: 'mobile', geometry: 'mobile' },
  { id: 'scroll-container', geometry: 'scroll-container' },
  { id: 'overflow-clipping', geometry: 'overflow-clipping' },
  { id: 'transformed-parent', geometry: 'transformed-parent' },
  { id: 'long-content', geometry: 'long-content' },
  { id: 'nested-overlay', geometry: 'nested-overlay' },
  { id: 'rtl', geometry: 'rtl' },
] as const;

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function displayNameFromSlug(slug: string): string {
  return slug
    .split('-')
    .map((part) => part === 'otp' ? 'OTP' : part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function contractRoutes(slug: ComponentSlug): string[] {
  return [
    `/components/${slug}`,
    `/components/${slug}/states`,
    `/components/${slug}/qa`,
    `/components/${slug}/qa/default`,
  ];
}

function profileFixtures(slug: ComponentSlug, profiles: UifnQaProfile[]): UifnQaFixture[] {
  const fixtures: UifnQaFixture[] = [
    {
      id: 'default',
      route: `/components/${slug}/qa/default`,
      profile: profiles[0],
      args: { state: 'default' },
      expectedDom: { rootSelector: `[data-uifn-component="${slug}"]`, minRootCount: 1 },
      expectedBehavior: { nonblank: true },
      actions: ['hover-root', 'tab-root'],
      assertions: ['root-visible', 'nonblank', 'a11y', 'theme-tokens'],
    },
  ];

  if (profiles.includes('overlay')) {
    for (const overlayCase of overlayFixtureCases) {
      fixtures.push({
        id: overlayCase.id,
        route: `/components/${slug}/qa/${overlayCase.id}`,
        profile: 'overlay',
        args: { collisionCase: overlayCase.geometry, open: true },
        expectedDom: { rootSelector: `[data-uifn-component="${slug}"]`, contentVisible: true },
        expectedBehavior: {
          geometry: overlayCase.geometry,
          escapeCloses: true,
          outsideClickCloses: slug !== 'alert-dialog',
        },
        actions: ['open-overlay', 'tab-overlay', 'escape-close', 'reopen-overlay', 'outside-click'],
        assertions: ['collision-fixture', 'content-visible', 'inside-boundary', 'trigger-associated', 'focus-return'],
      });
    }
    if (slug === 'dialog' || slug === 'alert-dialog' || slug === 'drawer') {
      fixtures.push({
        id: 'focus-trap',
        route: `/components/${slug}/qa/focus-trap`,
        profile: 'overlay',
        args: { focusTrap: true, open: true },
        expectedDom: { rootSelector: `[data-uifn-component="${slug}"]`, focusWithin: true },
        expectedBehavior: { focusTrap: true, focusReturn: true },
        actions: ['open-overlay', 'cycle-focus-forward', 'cycle-focus-backward', 'escape-close'],
        assertions: ['focus-trapped', 'focus-return', 'scroll-lock', 'accessible-name'],
      });
    }
  }

  if (profiles.includes('form')) {
    fixtures.push({
      id: 'form-submit',
      route: `/components/${slug}/qa/form-submit`,
      profile: 'form',
      args: { value: 'uifn-demo-value', invalid: false },
      expectedDom: { rootSelector: `[data-uifn-component="${slug}"]`, componentOwned: true },
      expectedBehavior: { componentOwnedForm: true },
      actions: ['enter-form-value', 'submit-form', 'attempt-disabled-input', 'inspect-invalid-state'],
      assertions: ['dom-value', 'callback-value', 'form-data', 'disabled-stable', 'invalid-aria'],
    });
  }

  if (profiles.includes('data-rich')) {
    const applicationOwnedTable = slug === 'table';
    fixtures.push({
      id: 'large-data',
      route: `/components/${slug}/qa/large-data`,
      profile: 'data-rich',
      args: { rowCount: 250, state: 'large-data' },
      expectedDom: { rootSelector: `[data-uifn-component="${slug}"]` },
      expectedBehavior: applicationOwnedTable
        ? { deterministicLargeData: true, semanticStructure: true, applicationOwnsDataOperations: true }
        : { deterministicLargeData: true },
      actions: applicationOwnedTable
        ? ['inspect-semantic-structure', 'scroll-data-region', 'resize-viewport']
        : ['exercise-data-rich-workflow'],
      assertions: applicationOwnedTable
        ? ['semantic-table-structure', 'responsive-state', 'no-blank-space']
        : ['data-state-transition', 'keyboard-operation', 'responsive-state', 'no-blank-space'],
    });
  }

  fixtures.push(
    {
      id: 'themes',
      route: `/components/${slug}/qa/themes`,
      profile: profiles[0],
      args: { visualMatrix: 'themes' },
      expectedDom: { rootSelector: `[data-uifn-component="${slug}"]` },
      expectedBehavior: { themes: ['light', 'dark', 'high-contrast-light', 'high-contrast-dark'] },
      actions: ['capture-visual'],
      assertions: ['nonblank', 'theme-tokens', 'baseline-match', 'no-text-overlap'],
    },
    {
      id: 'responsive',
      route: `/components/${slug}/qa/responsive`,
      profile: profiles.includes('layout') ? 'layout' : profiles[0],
      args: { visualMatrix: 'responsive' },
      expectedDom: { rootSelector: `[data-uifn-component="${slug}"]` },
      expectedBehavior: { viewports: ['mobile', 'tablet', 'desktop'] },
      actions: ['capture-visual'],
      assertions: ['nonblank', 'inside-viewport', 'no-major-clipping', 'baseline-match'],
    },
  );

  return fixtures;
}

function toDefinition(
  contract: (typeof STYLED_COMPONENT_CATALOG)[number],
): WorkbenchComponentDefinition {
  const slug = contract.id;
  const profiles = profilesForSlug(slug);
  return {
    family: 'component',
    name: contract.name,
    slug,
    displayName: displayNameFromSlug(slug),
    category: categoryForProfiles(profiles),
    profiles,
    states: unique(profiles.flatMap((profile) => defaultStatesByProfile[profile])),
    anatomy: contract.parts.map((part) => part.id),
    variants: ['default', 'subtle', 'outline'],
    sizes: profiles.some((profile) => ['control', 'form', 'navigation'].includes(profile))
      ? ['sm', 'md', 'lg']
      : ['md'],
    behaviors: interactionsForComponent(slug, profiles),
  };
}

export const workbenchComponents: WorkbenchComponentDefinition[] = STYLED_COMPONENT_CATALOG
  .map(toDefinition);

export const workbenchComponentSlugs = workbenchComponents.map((component) => component.slug);

export function createComponentQaContract(component: WorkbenchComponentDefinition): UifnQaContract {
  const primaryProfile = component.profiles[0];
  const states = unique(component.profiles.flatMap((profile) => defaultStatesByProfile[profile]).concat(component.states));
  const interactions = interactionsForComponent(component.slug, component.profiles)
    .filter((interaction) => interaction !== 'dismiss' || !['progress', 'skeleton'].includes(component.slug));
  const geometry = unique(component.profiles.flatMap((profile) => geometryByProfile[profile]));

  return {
    schemaVersion: 1,
    family: 'component',
    slug: component.slug,
    displayName: component.displayName,
    frameworks: [...workbenchFrameworks],
    qaProfile: primaryProfile,
    qaProfiles: [...component.profiles],
    requiredRoutes: unique([
      ...contractRoutes(component.slug),
      ...profileFixtures(component.slug, component.profiles).map((fixture) => fixture.route),
    ]),
    requiredStates: states,
    requiredInteractions: interactions,
    requiredA11y: ['axe', 'keyboard', 'accessible-name'],
    requiredGeometry: geometry,
    requiredVisual: ['nonblank', 'theme-token', 'no-major-clipping', 'no-text-overlap'],
    requiredResponsive: ['mobile', 'tablet', 'desktop'],
    requiredThemes: [...workbenchThemes],
    fixtures: profileFixtures(component.slug, component.profiles),
  };
}

export const componentQaContracts = workbenchComponents.map(createComponentQaContract);
