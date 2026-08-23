import type { UifnQaContract, UifnQaFixture } from './qa-contract.js';
import { workbenchFrameworks, workbenchThemes } from './qa-contract.js';

const comboboxFixtureIds = [
  'default',
  'default-placement',
  'edge-top-left',
  'edge-top-right',
  'edge-bottom-left',
  'edge-bottom-right',
  'mobile',
  'scroll-container',
  'overflow-clipping',
  'transformed-parent',
  'long-content',
  'nested-overlay',
  'rtl',
  'themes',
] as const;

const comboboxFixtures: UifnQaFixture[] = comboboxFixtureIds.map((id) => ({
  id,
  route: `/components/combobox/qa/${id}`,
  profile: 'overlay',
  args: { primitiveOverlay: 'combobox', collisionCase: id },
  expectedDom: { rootSelector: '[data-uifn-component="combobox"]', role: 'combobox' },
  expectedBehavior: { typeahead: true, contentVisible: true, escapeCloses: true },
  actions: ['type-filter', 'keyboard-select', 'escape-close', 'tab-overlay'],
  assertions: ['filtered-options', 'selected-value', 'inside-boundary', 'trigger-associated'],
}));

export const primitiveOverlayContracts: UifnQaContract[] = [
  {
    schemaVersion: 1,
    family: 'component',
    slug: 'combobox',
    displayName: 'Combobox Primitive',
    frameworks: [...workbenchFrameworks],
    qaProfile: 'overlay',
    qaProfiles: ['overlay'],
    requiredRoutes: [
      '/components/combobox',
      '/components/combobox/states',
      '/components/combobox/qa',
      ...comboboxFixtures.map((fixture) => fixture.route),
    ],
    requiredStates: ['default', 'open', 'disabled', 'invalid'],
    requiredInteractions: ['type', 'keyboard', 'escape-key', 'tab'],
    requiredA11y: ['axe', 'keyboard', 'accessible-name'],
    requiredGeometry: ['default-placement', 'top-left', 'top-right', 'bottom-left', 'bottom-right', 'mobile', 'scroll-container', 'overflow-clipping', 'transformed-parent', 'long-content', 'nested-overlay', 'rtl'],
    requiredVisual: ['nonblank', 'theme-token', 'no-major-clipping', 'no-text-overlap'],
    requiredResponsive: ['mobile', 'tablet', 'desktop'],
    requiredThemes: [...workbenchThemes],
    fixtures: comboboxFixtures,
  },
];
