export const CATALOG_SCHEMA_VERSION = 1;
export const CATALOG_VERSION = '1.0.0';
export const GENERATOR_VERSION = '1.0.0';

export const STABLE_FRAMEWORKS = ['react', 'svelte', 'solid'];

export const IMPLEMENTATION_KINDS = ['interactive-controller', 'typed-static-contract'];

export const BEHAVIOR_FAMILIES = [
  'disclosure',
  'modal-overlay',
  'menu-navigation',
  'selection-collection',
  'forms-input',
  'range-gesture',
  'date-color',
  'status-feedback',
  'static-foundation',
];

export const DOM_SERVICES = {
  root: 'root-scope-modality-tabbability',
  layer: 'dismissable-layer',
  focus: 'focus-scope',
  modal: 'modal-isolation-scroll-lock',
  position: 'positioning-auto-update',
  portal: 'portal-presence-transitions',
  formLive: 'form-bridges-live-regions',
};

export const FRAMEWORK_TARGETS = {
  react: {
    headlessPackage: '@uifn/react',
    styledPackage: '@uifn/components-react',
  },
  svelte: {
    headlessPackage: '@uifn/svelte',
    styledPackage: '@uifn/components-svelte',
  },
  solid: {
    headlessPackage: '@uifn/solid',
    styledPackage: '@uifn/components-solid',
  },
};

export const FORM_PROFILES = {
  none: {
    participation: 'none',
    valueShape: 'none',
    reset: 'none',
    validation: 'none',
  },
  native: {
    participation: 'native',
    valueShape: 'native',
    reset: 'native',
    validation: 'native',
  },
  scalar: {
    participation: 'controller-bridge',
    valueShape: 'scalar',
    reset: 'controller-and-native-form',
    validation: 'native-proxy-and-controller',
  },
  multiple: {
    participation: 'controller-bridge',
    valueShape: 'multiple',
    reset: 'controller-and-native-form',
    validation: 'native-proxy-and-controller',
  },
  file: {
    participation: 'native-file-input',
    valueShape: 'file-list-never-serialized',
    reset: 'native-and-controller',
    validation: 'native-and-controller',
  },
};

export const DOC_SECTIONS = [
  'overview',
  'anatomy',
  'state-actions-parts',
  'controlled-uncontrolled',
  'accessibility',
  'keyboard-pointer-touch',
  'forms',
  'direction-locale',
  'ssr-hydration',
  'composition-styling',
  'package-install',
  'source-install',
  'known-constraints',
];

export const STORY_PROFILES = {
  'interactive-controller': [
    'default',
    'controlled',
    'uncontrolled',
    'disabled-readonly-invalid',
    'keyboard-focus',
    'rtl',
    'forced-colors',
    'reduced-motion',
    'responsive',
    'edge-cases',
  ],
  'typed-static-contract': [
    'default',
    'semantic-variants',
    'rtl',
    'forced-colors',
    'reduced-motion',
    'responsive',
    'edge-cases',
  ],
};

const commonPreferences = {
  forcedColors: 'Use native/system colors and preserve perceivable state without color alone.',
  reflow: 'Remain operable without two-dimensional scrolling at 400% zoom except intrinsically two-dimensional content.',
  reducedMotion: 'Remove non-essential motion while preserving state changes and completion.',
  rtl: 'Declare logical versus physical direction behavior and mirror only directional semantics.',
};

function profile(value) {
  return {
    ...value,
    preferences: { ...commonPreferences, ...(value.preferences ?? {}) },
  };
}

export const ACCESSIBILITY_PROFILES = {
  disclosure: profile({
    normativeBasis: ['native-html', 'wai-aria-apg-disclosure'],
    nativeSemantics: 'Use a native button for each trigger and a related region only when the content warrants a landmark.',
    accessibleName: { required: true, sources: ['trigger-text', 'aria-label', 'aria-labelledby'] },
    description: { supported: true, relationships: ['aria-describedby'] },
    keyboard: { model: 'disclosure', keys: ['Tab', 'Shift+Tab', 'Enter', 'Space', 'ArrowDown', 'ArrowUp', 'Home', 'End'] },
    pointerTouch: ['activate-trigger', 'preserve-native-click-semantics'],
    focus: ['visible-trigger-focus', 'no-focus-loss-on-collapse'],
    announcements: ['expanded-state-via-native-or-aria-state'],
    wcag: ['1.3.1', '2.1.1', '2.1.2', '2.4.3', '2.4.7', '4.1.2'],
  }),
  'modal-overlay': profile({
    normativeBasis: ['native-html', 'wai-aria-apg-dialog-modal', 'wai-aria-apg-tooltip'],
    nativeSemantics: 'Use dialog or tooltip semantics appropriate to the primitive and never apply one generic overlay role.',
    accessibleName: { required: true, sources: ['title-part', 'aria-label', 'aria-labelledby'] },
    description: { supported: true, relationships: ['aria-describedby'] },
    keyboard: { model: 'overlay-specific', keys: ['Tab', 'Shift+Tab', 'Escape', 'Enter', 'Space'] },
    pointerTouch: ['trigger-activation', 'outside-interaction-by-declared-policy', 'touch-cancellation'],
    focus: ['initial-focus', 'containment-when-modal', 'restore-focus', 'nested-scope-arbitration'],
    announcements: ['role-name-description-state-on-open'],
    wcag: ['1.3.1', '1.4.13', '2.1.1', '2.1.2', '2.4.3', '2.4.7', '2.4.11', '4.1.2'],
  }),
  'menu-navigation': profile({
    normativeBasis: ['native-html', 'wai-aria-apg-menu', 'wai-aria-apg-tabs', 'wai-aria-apg-treeview'],
    nativeSemantics: 'Choose the primitive-specific menu, tab, toolbar, navigation, pagination, or tree model.',
    accessibleName: { required: true, sources: ['visible-label', 'aria-label', 'aria-labelledby'] },
    description: { supported: true, relationships: ['aria-describedby'] },
    keyboard: { model: 'primitive-specific-navigation', keys: ['Tab', 'Shift+Tab', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', 'Space', 'Escape', 'typeahead'] },
    pointerTouch: ['item-activation', 'submenu-pointer-grace-where-applicable', 'contextmenu-where-applicable'],
    focus: ['roving-tabindex-or-activedescendant', 'deterministic-focus-repair', 'restore-focus'],
    announcements: ['active-selected-expanded-current-state'],
    wcag: ['1.3.1', '2.1.1', '2.1.2', '2.4.3', '2.4.7', '2.4.11', '2.5.7', '4.1.2'],
  }),
  'selection-collection': profile({
    normativeBasis: ['native-html', 'wai-aria-apg-listbox', 'wai-aria-apg-combobox', 'wai-aria-apg-radio'],
    nativeSemantics: 'Use the declared listbox, combobox, radio, checkbox, switch, tag, or tree selection model.',
    accessibleName: { required: true, sources: ['label-element', 'aria-label', 'aria-labelledby'] },
    description: { supported: true, relationships: ['aria-describedby', 'aria-errormessage'] },
    keyboard: { model: 'selection-specific', keys: ['Tab', 'Shift+Tab', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', 'Enter', 'Space', 'Escape', 'typeahead'] },
    pointerTouch: ['select-item', 'toggle-item', 'touch-scroll-arbitration'],
    focus: ['active-item', 'selected-item', 'dynamic-collection-focus-repair'],
    announcements: ['selection-change', 'result-count-when-dynamic', 'validation-state'],
    wcag: ['1.3.1', '2.1.1', '2.1.2', '2.4.3', '2.4.7', '3.3.1', '3.3.2', '4.1.2', '4.1.3'],
  }),
  'forms-input': profile({
    normativeBasis: ['native-html', 'wai-aria-apg-spinbutton'],
    nativeSemantics: 'Prefer native form controls and preserve labels, descriptions, errors, disabled fieldsets, reset, and validation.',
    accessibleName: { required: true, sources: ['label-element', 'aria-label', 'aria-labelledby'] },
    description: { supported: true, relationships: ['aria-describedby', 'aria-errormessage'] },
    keyboard: { model: 'native-input-plus-declared-enhancements', keys: ['Tab', 'Shift+Tab', 'Enter', 'Space', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'composition'] },
    pointerTouch: ['native-control-interaction', 'target-size', 'file-picker-where-applicable'],
    focus: ['visible-input-focus', 'error-focus-policy', 'caret-and-selection-preservation'],
    announcements: ['validation-error', 'status-change', 'operation-result-without-secret-content'],
    wcag: ['1.3.1', '1.3.5', '2.1.1', '2.4.3', '2.4.7', '2.5.8', '3.3.1', '3.3.2', '3.3.3', '4.1.2', '4.1.3'],
  }),
  'range-gesture': profile({
    normativeBasis: ['native-html', 'wai-aria-apg-slider', 'wai-aria-apg-carousel'],
    nativeSemantics: 'Expose declared range or group semantics with keyboard alternatives for every pointer/touch gesture.',
    accessibleName: { required: true, sources: ['visible-label', 'aria-label', 'aria-labelledby'] },
    description: { supported: true, relationships: ['aria-describedby'] },
    keyboard: { model: 'range-or-gesture-specific', keys: ['Tab', 'Shift+Tab', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'] },
    pointerTouch: ['pointer-capture', 'cancel-and-lost-capture', 'touch-scroll-arbitration', 'keyboard-alternative'],
    focus: ['focusable-operable-handle', 'multi-handle-order', 'visible-focus'],
    announcements: ['localized-value-text', 'rate-limited-continuous-change'],
    wcag: ['1.3.1', '2.1.1', '2.1.2', '2.4.7', '2.5.1', '2.5.7', '2.5.8', '4.1.2'],
  }),
  'date-color': profile({
    normativeBasis: ['native-html', 'wai-aria-apg-grid', 'wai-aria-apg-spinbutton'],
    nativeSemantics: 'Expose structured locale-aware segments, grids, or channels rather than display-string identity.',
    accessibleName: { required: true, sources: ['visible-label', 'aria-label', 'aria-labelledby'] },
    description: { supported: true, relationships: ['aria-describedby', 'aria-errormessage'] },
    keyboard: { model: 'segment-grid-channel-specific', keys: ['Tab', 'Shift+Tab', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', 'Enter', 'Escape'] },
    pointerTouch: ['segment-or-grid-selection', 'drag-channel-with-keyboard-alternative'],
    focus: ['segment-focus', 'grid-focus-repair', 'restore-focus'],
    announcements: ['localized-value', 'selection-status', 'validation-state'],
    wcag: ['1.3.1', '2.1.1', '2.4.3', '2.4.7', '3.3.1', '3.3.2', '4.1.2', '4.1.3'],
  }),
  'status-feedback': profile({
    normativeBasis: ['native-html', 'wai-aria-live-regions'],
    nativeSemantics: 'Use meter, progressbar, status, timer, step, or alert semantics only as declared for each state.',
    accessibleName: { required: true, sources: ['visible-label', 'aria-label', 'aria-labelledby'] },
    description: { supported: true, relationships: ['aria-describedby'] },
    keyboard: { model: 'native-or-workflow-specific', keys: ['Tab', 'Shift+Tab', 'Enter', 'Space', 'Escape'] },
    pointerTouch: ['action-activation-where-interactive', 'swipe-with-keyboard-alternative-where-applicable'],
    focus: ['do-not-steal-focus-for-passive-status', 'restore-focus-for-dismissed-workflow'],
    announcements: ['politeness-by-severity', 'deduplicate', 'rate-limit', 'ordered-queue'],
    wcag: ['1.3.1', '2.1.1', '2.2.1', '2.4.3', '3.2.2', '4.1.2', '4.1.3'],
  }),
  'static-foundation': profile({
    normativeBasis: ['native-html'],
    nativeSemantics: 'Use the strongest native element and avoid adding widget roles or subscriptions to static content.',
    accessibleName: { required: false, sources: ['native-text', 'alt', 'aria-label', 'aria-labelledby'] },
    description: { supported: true, relationships: ['native-description', 'aria-describedby'] },
    keyboard: { model: 'native-only', keys: ['Tab', 'Shift+Tab', 'Enter', 'Space'] },
    pointerTouch: ['native-activation-where-interactive'],
    focus: ['native-focus-only', 'visible-focus-where-focusable'],
    announcements: ['none-unless-status-semantics-declared'],
    wcag: ['1.1.1', '1.3.1', '1.4.1', '2.1.1', '2.4.7', '4.1.2'],
  }),
};
