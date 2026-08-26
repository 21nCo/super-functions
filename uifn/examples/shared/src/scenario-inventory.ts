import { workbenchComponents, type ComponentSlug } from './component-inventory.js';

export interface WorkbenchScenarioDefinition {
  family: 'scenario';
  slug: string;
  displayName: string;
  description: string;
  componentSlugs: ComponentSlug[];
  patternSlugs: string[];
  sfPanelSlugs: string[];
}

export const workbenchScenarios: WorkbenchScenarioDefinition[] = [
  {
    family: 'scenario',
    slug: 'settings-console',
    displayName: 'Settings Console',
    description: 'Account and workspace settings with forms, toggles, validation, navigation, and feedback.',
    componentSlugs: [
      'accordion',
      'alert-dialog',
      'avatar',
      'button',
      'checkbox',
      'checkbox-group',
      'collapsible',
      'dialog',
      'drawer',
      'editable',
      'field',
      'fieldset',
      'form',
      'input',
      'password-input',
      'pin-input',
      'radio-group',
      'rating-group',
      'select',
      'separator',
      'switch',
      'tabs',
      'tags-input',
      'toast',
      'toggle',
      'toggle-group',
      'tooltip',
    ],
    patternSlugs: ['auth-panel', 'api-key-table', 'session-list', 'user-profile-card'],
    sfPanelSlugs: ['authfn-auth-panel', 'authfn-api-key-table', 'authfn-session-list', 'authfn-user-profile-card'],
  },
  {
    family: 'scenario',
    slug: 'operations-dashboard',
    displayName: 'Operations Dashboard',
    description: 'Dense operational dashboard with data, navigation, progress, loading, and responsive layout surfaces.',
    componentSlugs: [
      'angle-slider',
      'button',
      'carousel',
      'date-input',
      'date-picker',
      'file-upload',
      'image-cropper',
      'meter',
      'number-input',
      'pagination',
      'progress',
      'scroll-area',
      'slider',
      'splitter',
      'steps',
      'timer',
      'tree-view',
    ],
    patternSlugs: ['provider-picker', 'o-auth-connections-panel', 'webhook-endpoint-table'],
    sfPanelSlugs: ['plugfn-provider-picker', 'plugfn-oauth-connections-panel', 'plugfn-webhook-endpoint-table'],
  },
  {
    family: 'scenario',
    slug: 'command-center',
    displayName: 'Command Center',
    description: 'Overlay-heavy workflow for menus, popovers, contextual actions, notifications, and file/billing panels.',
    componentSlugs: [
      'autocomplete',
      'button',
      'clipboard',
      'color-picker',
      'combobox',
      'context-menu',
      'hover-card',
      'input',
      'listbox',
      'menu',
      'menubar',
      'navigation-menu',
      'popover',
      'qr-code',
      'toolbar',
      'tour',
    ],
    patternSlugs: [
      'file-dropzone-panel',
      'upload-progress-list',
      'file-list-panel',
      'quota-usage-panel',
      'billing-plan-cards',
      'subscription-status-panel',
      'invoice-table',
    ],
    sfPanelSlugs: [
      'filefn-file-dropzone-panel',
      'filefn-upload-progress-list',
      'filefn-file-list-panel',
      'filefn-quota-usage-panel',
      'billfn-billing-plan-cards',
      'billfn-subscription-status-panel',
      'billfn-invoice-table',
    ],
  },
];

export const workbenchScenarioComponentCoverage = new Set<ComponentSlug>(
  workbenchScenarios.flatMap((scenario) => scenario.componentSlugs)
);

export function getScenarioBySlug(slug: string): WorkbenchScenarioDefinition | undefined {
  return workbenchScenarios.find((scenario) => scenario.slug === slug);
}

export function getUncoveredScenarioComponents(): ComponentSlug[] {
  return workbenchComponents
    .map((component) => component.slug)
    .filter((slug) => !workbenchScenarioComponentCoverage.has(slug));
}
