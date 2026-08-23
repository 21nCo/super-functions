import { STYLED_COMPONENT_CATALOG } from '@uifn/components';
import {
  componentPropsForSlug,
  getComponentBySlug,
} from './workbench-model.js';
import {
  normalizeCatalogBasePath,
  stripCatalogBasePath,
  withCatalogBasePath,
} from './catalog-routing.js';
import { workbenchComponents, type ComponentSlug } from './component-inventory.js';
import type { WorkbenchRoute } from './routes.js';
import { catalogThemeStyle } from './catalog-theme.js';
import { CATALOG_ACCESSIBILITY } from './catalog-accessibility.generated.js';
import {
  catalogDemoChildren,
  catalogDemoFixtureIds,
  catalogDemoFixtureLabel,
  catalogDemoPartInstances,
  catalogDemoPartProps,
  catalogDemoPartText,
  catalogDemoRootText,
  catalogDemoSnippetRootProps,
  getCatalogComponentDemo,
  type CatalogComponentDemo,
  type CatalogDemoPart,
} from './component-demo.js';

export type CatalogFramework = 'react' | 'svelte' | 'solid';

const frameworkLabels: Record<CatalogFramework, string> = {
  react: 'React + Next.js',
  svelte: 'Svelte + SvelteKit',
  solid: 'Solid + SolidStart',
};

const frameworkShortLabels: Record<CatalogFramework, string> = {
  react: 'React',
  svelte: 'Svelte',
  solid: 'Solid',
};

const catalogFrameworks: CatalogFramework[] = ['react', 'svelte', 'solid'];

const descriptionOverrides: Record<string, string> = {
  accordion: 'A vertically stacked set of interactive headings that reveal content with keyboard support.',
  'alert-dialog': 'A modal confirmation surface for destructive or consequential actions, with least-destructive focus and explicit cancel and action controls.',
  'angle-slider': 'A keyboard and pointer-operable circular range control with min, max, step, disabled, and read-only values.',
  autocomplete: 'A text input with filtered suggestions, active-item focus, empty results, and controlled or uncontrolled selection.',
  avatar: 'An image and delayed fallback composition for representing a person, team, or entity.',
  badge: 'A compact semantic label for statuses, categories, counts, and metadata with restrained visual variants.',
  breadcrumb: 'A semantic navigation trail with current-page state, links, decorative separators, and overflow ellipsis.',
  button: 'An accessible action control with variants, sizes, loading, disabled, and focus-visible states.',
  card: 'A composable content surface with header, title, description, action, content, footer, and optional elevation.',
  carousel: 'A controlled or uncontrolled sequence of items with previous, next, indicators, looping, orientation, and optional autoplay.',
  checkbox: 'A form-ready boolean control with controlled and uncontrolled state support.',
  'checkbox-group': 'A labeled checkbox collection with native form values, required and invalid states, and group-level error content.',
  clipboard: 'A copy action with pending, copied, and error status feedback that does not expose clipboard content in announcements.',
  collapsible: 'A disclosure control that shows or hides one related content region without losing trigger focus.',
  'color-picker': 'A color selection surface with color-area, channel controls, swatch, alpha, color-space, overlay, and native form value support.',
  combobox: 'An editable selection control with filtered items, keyboard navigation, single or multiple values, and native form submission.',
  command: 'A searchable command collection with composition-safe input, keyboard navigation, groups, shortcuts, empty and loading states, and optional form value.',
  'context-menu': 'A contextual action menu with focus management, collision handling, and keyboard navigation.',
  'date-input': 'A locale- and time-zone-aware segmented date input with min, max, disabled, read-only, and native form value support.',
  'date-picker': 'A segmented date field and calendar grid with locale, time zone, range constraints, unavailable dates, and native form submission.',
  dialog: 'A modal surface with focus management, Escape handling, and accessible title and description anatomy.',
  drawer: 'A modal side surface with focus containment, backdrop, close control, side placement, and a declared dismiss threshold.',
  editable: 'An inline preview-to-input editing flow with submit, cancel, validation, and native form value support.',
  field: 'A form-field composition that associates a label, control, description, error, and required indicator.',
  fieldset: 'A native fieldset composition with legend, description, error, disabled, and invalid states.',
  'file-upload': 'A file picker and dropzone with accept, count and size limits, item removal, status, validation, and native input semantics.',
  'floating-panel': 'A positioned panel that can be modal, draggable, and resizable, with title, description, handles, and close behavior.',
  form: 'A native form foundation with disabled state, validation opt-out, error summary, and action regions.',
  'hover-card': 'A delayed, positioned preview surface associated with a link-like trigger and supporting pointer and keyboard dismissal.',
  'image-cropper': 'A pointer and keyboard-operable crop viewport with aspect ratio, size constraints, resize handles, zoom, and status output.',
  input: 'A native text input contract with controlled or uncontrolled value, type, validation, disabled, read-only, and required states.',
  'input-group': 'A unified form-control surface for inputs or textareas with leading or trailing addons, text, and buttons.',
  listbox: 'A labeled single or multiple selection collection with groups, keyboard navigation, indicators, and native form values.',
  marquee: 'A continuously moving content track with direction, speed, hover and focus pause, and reduced-motion behavior.',
  menu: 'A trigger-based action menu with groups, separators, submenus, looping, direction, and keyboard navigation.',
  menubar: 'A horizontal application menu system with multiple menus, submenus, controlled value, direction, and roving keyboard focus.',
  meter: 'A labeled scalar measurement with min, max, low, high, optimum, formatted value, and semantic meter state.',
  'navigation-menu': 'A site-navigation composition with links, expandable content, viewport, orientation, direction, and delayed disclosure.',
  'number-input': 'A locale-aware numeric input with min, max, step, increment, decrement, scrubber, validation, and native form value.',
  pagination: 'A navigation control for page ranges with current page, previous and next actions, sibling count, and disabled state.',
  'password-input': 'A password field with visibility control, autocomplete, strength and error regions, and native input semantics.',
  'pin-input': 'A fixed-length segmented PIN or one-time-code input with masking, native form value, validation, and keyboard entry.',
  popover: 'A positioned non-modal or modal surface with anchor, title, description, arrow, close control, and declared dismissal policies.',
  progress: 'A linear or circular progress indicator with determinate and indeterminate states, bounds, label, and formatted value.',
  'qr-code': 'A semantic figure that renders a value as an SVG QR image with error correction, size, and accessible caption.',
  'radio-group': 'A labeled single-selection group with orientation, looping keyboard focus, validation, and native radio form values.',
  'rating-group': 'A keyboard and pointer-operable rating control with item count, optional half values, label, value text, and native form value.',
  'scroll-area': 'A custom scroll viewport with horizontal or vertical scrollbars, draggable thumbs, direction, and delayed visibility.',
  'segment-group': 'A single-selection group of segmented buttons with orientation, indicator, validation, and native form value.',
  select: 'An accessible selection control with trigger, listbox, options, groups, and hidden form input.',
  separator: 'A horizontal or vertical visual or semantic separator with an explicitly decorative mode.',
  'signature-pad': 'A canvas-based signature input with pointer capture, keyboard alternatives, undo, clear, status, and native form value.',
  skeleton: 'A decorative loading placeholder with tokenized geometry, reduced-motion behavior, and no accidental accessibility announcement.',
  slider: 'A single- or multi-thumb range input with bounds, step, orientation, direction, value text, and native form values.',
  splitter: 'A keyboard and pointer-resizable panel group with controlled sizes, min and max constraints, orientation, and direction.',
  steps: 'A linear or non-linear step navigator with current and completed states, orientation, indicators, and associated content.',
  switch: 'A labeled boolean form control with controlled or uncontrolled checked state, read-only and required behavior, and native form value.',
  table: 'A responsive semantic table composition with caption, header, body, footer, rows, header cells, data cells, and optional striping.',
  tabs: 'A keyboard-navigable tab set for switching between related content panels.',
  'tags-input': 'A multi-value text input with tag deletion, duplicate and maximum limits, delimiter parsing, validation, and native form values.',
  textarea: 'A native multiline input with controlled or uncontrolled value, validation, resize policy, disabled, read-only, and required states.',
  timer: 'A count-up or count-down timer with start, pause, reset, controlled remaining time, completion, and rate-limited announcements.',
  toast: 'A managed notification viewport with titles, descriptions, actions, dismissal, limits, placement, duration, and pause behavior.',
  toggle: 'A two-state pressed button with controlled or uncontrolled state and disabled behavior.',
  'toggle-group': 'A single- or multiple-selection group of toggle buttons with orientation, looping keyboard focus, and disabled state.',
  toolbar: 'A labeled toolbar composition for buttons, links, toggles, separators, orientation, direction, and roving keyboard focus.',
  tooltip: 'A lightweight contextual label with accessible trigger relationships and placement behavior.',
  tour: 'A modal or non-modal guided sequence with target spotlight, step navigation, progress, skip, close, and focus restoration.',
  'tree-view': 'A hierarchical collection with expansion, selection, branches, active-item focus, direction, and keyboard navigation.',
};

const catalogGuides = [
  { path: '/getting-started', label: 'Getting started' },
  { path: '/styling', label: 'Styling' },
  { path: '/accessibility', label: 'Accessibility' },
  { path: '/registry', label: 'Registry' },
] as const;

interface CatalogExampleDefinition {
  readonly kicker: string;
  readonly title: string;
  readonly description: string;
  readonly target: 'preview' | 'states' | 'qa' | `/${string}`;
}

const catalogNamedExamples = {
  button: [
    { kicker: 'Action hierarchy', title: 'Primary and supporting actions', description: 'Compare solid, secondary, outline, ghost, destructive, and link emphasis without duplicating the default action.', target: 'states' },
    { kicker: 'Async action', title: 'Loading and unavailable states', description: 'Verify that progress prevents repeated activation while disabled actions remain readable.', target: 'states' },
    { kicker: 'Compact controls', title: 'Accessible icon buttons', description: 'Inspect three icon-only sizes with explicit accessible names and usable hit targets.', target: 'states' },
  ],
  card: [
    { kicker: 'Product composition', title: 'Release health summary', description: 'Header, status, metrics, owners, and a supporting action form one realistic operational surface.', target: 'preview' },
    { kicker: 'Surface hierarchy', title: 'Default, elevated, and outline', description: 'Compare genuinely distinct elevation treatments rather than nominal variant labels.', target: 'states' },
    { kicker: 'Content rhythm', title: 'Compact and spacious density', description: 'See how the same anatomy adapts to dashboards and lower-density overview pages.', target: 'states' },
  ],
  checkbox: [
    { kicker: 'Selection', title: 'Unchecked, checked, and indeterminate', description: 'Compare all three semantic states, including the mixed-state dash and native form value.', target: 'states' },
    { kicker: 'Constraints', title: 'Disabled and read-only', description: 'Confirm state remains perceivable when interaction is unavailable or application-owned.', target: 'states' },
    { kicker: 'Behavior', title: 'Keyboard and form integration', description: 'Exercise Space activation, focus visibility, validation, and submission boundaries.', target: 'qa' },
  ],
  switch: [
    { kicker: 'Boolean setting', title: 'Checked and unchecked', description: 'Inspect track and thumb movement with a persistent text label.', target: 'states' },
    { kicker: 'Constraints', title: 'Disabled and read-only', description: 'Compare unavailable states without erasing the current value.', target: 'states' },
    { kicker: 'Directionality', title: 'Keyboard, form, and RTL behavior', description: 'Verify native form value, Space activation, and mirrored thumb travel.', target: 'qa' },
  ],
  field: [
    { kicker: 'Form composition', title: 'Label, control, and description', description: 'Review the complete associated field anatomy instead of an isolated input.', target: 'preview' },
    { kicker: 'Validation', title: 'Invalid and required states', description: 'Inspect error relationships, required indicators, and non-color feedback.', target: 'states' },
    { kicker: 'Constraints', title: 'Disabled and read-only fields', description: 'Compare product states that preserve labels, values, and descriptions.', target: 'states' },
  ],
  input: [
    { kicker: 'Native control', title: 'Text entry with product copy', description: 'Use the real input contract with familiar browser editing and autocomplete behavior.', target: 'preview' },
    { kicker: 'Validation', title: 'Invalid, disabled, and read-only', description: 'Compare intrinsic control states and their stable styling hooks.', target: 'states' },
    { kicker: 'Integration', title: 'Form ownership and autofill', description: 'Exercise native events, validation, keyboard input, and application-owned submission.', target: 'qa' },
  ],
  'input-group': [
    { kicker: 'Compound field', title: 'Prefix, input, and action', description: 'Compose addons and buttons into one coherent control surface.', target: 'preview' },
    { kicker: 'Layouts', title: 'Leading and trailing addons', description: 'Compare control anatomy without sacrificing native input behavior.', target: 'states' },
    { kicker: 'Validation', title: 'Disabled and invalid groups', description: 'Verify group-level focus, error, and unavailable styling.', target: 'qa' },
  ],
  select: [
    { kicker: 'Selection', title: 'Role picker', description: 'Open a real listbox, choose an option, and inspect the hidden native form value.', target: 'preview' },
    { kicker: 'Popup states', title: 'Open, selected, and disabled', description: 'Compare trigger, option, indicator, and unavailable presentation.', target: 'states' },
    { kicker: 'Behavior', title: 'Keyboard, collision, and RTL', description: 'Exercise arrow-key selection, typeahead, focus restoration, and positioning.', target: 'qa' },
  ],
  combobox: [
    { kicker: 'Editable selection', title: 'Search and choose a teammate', description: 'Filter real options while preserving active-item focus and native form submission.', target: 'preview' },
    { kicker: 'Results', title: 'Open, selected, empty, and loading', description: 'Inspect the input and popup across meaningful data states.', target: 'states' },
    { kicker: 'Behavior', title: 'Composition input and keyboard navigation', description: 'Exercise IME-safe filtering, arrow keys, Escape, and focus restoration.', target: 'qa' },
  ],
  dialog: [
    { kicker: 'Product flow', title: 'Profile editor', description: 'Open a complete form dialog with title, description, actions, and focus restoration.', target: 'preview' },
    { kicker: 'Content pressure', title: 'Long, scrollable content', description: 'Verify constrained viewport behavior without turning the public example into a stress box.', target: '/components/dialog/qa/long-content' },
    { kicker: 'Layering', title: 'Nested confirmation dialog', description: 'Inspect nested modal ownership, Escape handling, and focus return.', target: '/components/dialog/qa/nested-overlay' },
    { kicker: 'Accessibility', title: 'Focus trap and RTL', description: 'Run the explicit focus-containment and right-to-left regression fixtures.', target: '/components/dialog/qa/focus-trap' },
  ],
  menu: [
    { kicker: 'Actions', title: 'Project action menu', description: 'Compose labels, groups, separators, submenus, shortcuts, and disabled items.', target: 'preview' },
    { kicker: 'Behavior', title: 'Keyboard navigation and looping', description: 'Exercise arrow keys, typeahead, submenu ownership, Escape, and focus return.', target: 'qa' },
    { kicker: 'Positioning', title: 'Edges, scrolling, and RTL', description: 'Inspect collision handling across viewport and transformed-container fixtures.', target: 'qa' },
  ],
  'navigation-menu': [
    { kicker: 'Site navigation', title: 'Links and expandable sections', description: 'Combine direct links with delayed disclosure content and a shared viewport.', target: 'preview' },
    { kicker: 'Keyboard', title: 'Enter, Space, arrows, and Escape', description: 'Verify disclosure toggling and focus movement without trapping normal link navigation.', target: 'qa' },
    { kicker: 'Layout', title: 'Horizontal, vertical, and RTL', description: 'Inspect orientation and direction across the same semantic navigation anatomy.', target: 'states' },
  ],
  tabs: [
    { kicker: 'Product navigation', title: 'Workspace overview tabs', description: 'Switch related panels through the real tablist, triggers, and panel anatomy.', target: 'preview' },
    { kicker: 'Selection', title: 'Active, disabled, and focused tabs', description: 'Compare the selected treatment without relying on a stray indicator glyph.', target: 'states' },
    { kicker: 'Behavior', title: 'Arrow keys, activation, and RTL', description: 'Exercise roving focus and direction-aware keyboard movement.', target: 'qa' },
  ],
  command: [
    { kicker: 'Command palette', title: 'Search workspace actions', description: 'Use a visible search affordance, grouped results, shortcuts, and active-item focus.', target: 'preview' },
    { kicker: 'Result states', title: 'Empty, loading, and selected', description: 'Inspect legible feedback while the collection filters or waits for data.', target: 'states' },
    { kicker: 'Behavior', title: 'Composition-safe keyboard control', description: 'Exercise IME input, arrow navigation, Enter selection, and Escape.', target: 'qa' },
  ],
  table: [
    { kicker: 'Application composition', title: 'Deployment dashboard', description: 'Filter, select, inspect, and paginate realistic deployment rows around the semantic table primitive.', target: 'preview' },
    { kicker: 'Presentation', title: 'Compact, spacious, and striped', description: 'Compare density and row treatments while retaining header and cell semantics.', target: 'states' },
    { kicker: 'Ownership boundary', title: 'Large data integration', description: 'Exercise application-owned filtering, selection, sorting, and pagination without hiding them inside core Table.', target: '/components/table/qa/large-data' },
  ],
  skeleton: [
    { kicker: 'Loading layout', title: 'Card and list placeholders', description: 'Compose tokenized geometry that mirrors the content expected to replace it.', target: 'preview' },
    { kicker: 'Geometry', title: 'Text, avatar, and media shapes', description: 'Compare reusable radii and dimensions without accidental accessible announcements.', target: 'states' },
    { kicker: 'Motion', title: 'Reduced-motion behavior', description: 'Verify shimmer suppression when the user requests less animation.', target: 'qa' },
  ],
} as const satisfies Partial<Record<ComponentSlug, readonly CatalogExampleDefinition[]>>;

const partCopy: Record<string, Partial<Record<string, string>>> = {
  accordion: {
    item: '',
    trigger: 'What makes uifn different?',
    content: 'One component contract, rendered through the framework your application already uses.',
  },
  'alert-dialog': {
    trigger: 'Delete workspace',
    title: 'Delete this workspace?',
    description: 'This action cannot be undone. All project data will be permanently removed.',
    action: 'Delete workspace',
    cancel: 'Cancel',
  },
  breadcrumb: {
    list: '',
    item: '',
    link: 'Workspace',
    separator: '/',
    page: 'Settings',
  },
  badge: {
    root: 'Production',
  },
  card: {
    title: 'Deploy with confidence',
    description: 'Review release health, ownership, and recent changes in one place.',
    action: 'View status',
    content: 'All checks passed · 3 environments healthy',
    footer: 'Last deployed 8 minutes ago',
  },
  command: {
    label: 'Command menu',
    input: '',
    groupHeading: 'Workspace',
    item: 'Search projects',
    itemIndicator: '✓',
    shortcut: '⌘ K',
    empty: 'No commands found',
    loading: 'Loading commands…',
  },
  'input-group': {
    addon: 'https://',
    text: 'domain',
    input: '',
    textarea: '',
    button: 'Copy',
  },
  skeleton: {
    root: '',
  },
  table: {
    caption: 'Recent deployments',
    head: 'Environment',
    cell: 'Production',
  },
  textarea: {
    root: '',
  },
  checkbox: {
    indicator: '✓',
    input: '',
  },
  collapsible: {
    trigger: 'Show advanced settings',
    content: 'Configure audit logs, retention, and environment-level access controls.',
  },
  'context-menu': {
    trigger: 'Right-click area',
    content: '',
    label: 'Project actions',
    item: 'Duplicate project',
    separator: '',
  },
  dialog: {
    trigger: 'Edit profile',
    title: 'Edit profile',
    description: 'Update your display name and contact information.',
    close: 'Close',
  },
  'dropdown-menu': {
    trigger: 'Open account menu',
    content: '',
    label: 'My account',
    item: 'Account settings',
    separator: '',
  },
  form: {
    field: '',
    label: 'Workspace name',
    control: 'Acme Studio',
    description: 'This is visible to everyone in your workspace.',
    message: 'Workspace name is available.',
  },
  'hover-card': {
    trigger: '@alex',
    content: 'Alex Morgan · Product designer · 42 shared projects',
    arrow: '',
  },
  'input-otp': {
    group: '',
    slot: '4',
    separator: '—',
    hiddenInput: '',
  },
  menubar: {
    menu: '',
    trigger: 'File',
    content: '',
    item: 'New project',
  },
  pagination: {
    list: '',
    item: '',
    link: '2',
    previous: 'Previous',
    next: 'Next',
    ellipsis: '…',
  },
  popover: {
    trigger: 'Invite member',
    anchor: '',
    content: 'Invite teammates by email and choose their workspace role.',
    arrow: '',
    close: 'Close',
  },
  'radio-group': {
    item: 'Professional',
    indicator: '',
    input: '',
  },
  'scroll-area': {
    viewport: 'Design review completed · Deployment succeeded · New member joined',
    scrollbar: '',
    thumb: '',
    corner: '',
  },
  select: {
    trigger: 'Choose a role',
    value: 'Member',
    content: '',
    listbox: '',
    option: 'Administrator',
    group: '',
    label: 'Workspace roles',
    hiddenInput: '',
  },
  sheet: {
    trigger: 'Open details',
    title: 'Project details',
    description: 'Review ownership, deployment status, and recent activity.',
    content: '',
    close: 'Close',
  },
  slider: {
    track: '',
    range: '',
    thumb: '',
    input: '',
  },
  switch: {
    thumb: '',
    input: '',
  },
  tabs: {
    list: '',
    trigger: 'Overview',
    content: 'Track activity, usage, and important workspace changes in one place.',
  },
  'toggle-group': {
    item: 'Center',
  },
  tooltip: {
    trigger: 'Copy link',
    content: 'Copy project link',
    arrow: '',
  },
};

export function catalogFrameworkLabel(framework: CatalogFramework): string {
  return frameworkLabels[framework];
}

export function catalogSidebarHtml(
  basePath: string,
  framework: CatalogFramework,
  currentPath: string,
): string {
  const primary = [
    ...catalogGuides.slice(0, 1),
    { path: '/components', label: 'Components' },
    ...catalogGuides.slice(1),
  ];
  const build = [
    { path: '/hooks', label: 'Hooks' },
    { path: '/scenarios', label: 'Examples' },
    { path: '/patterns', label: 'Patterns' },
    { path: '/sf', label: 'Superfunction UI' },
  ];
  const componentGroups = groupedComponents();
  const link = (item: { path: string; label: string }) => `
    <a
      href="${withCatalogBasePath(basePath, item.path)}"
      ${catalogPathIsActive(currentPath, item.path) ? 'aria-current="page"' : ''}
    >${escapeHtml(item.label)}</a>
  `;

  return `
    <aside class="workbench-nav" aria-label="Catalog navigation" data-catalog-sidebar>
      <div class="catalog-sidebar-heading">
        <a class="catalog-brand" href="/components/">
          <span class="catalog-brand-mark" aria-hidden="true">ui</span>
          <span><strong>uifn</strong><small>component catalog</small></span>
        </a>
        <button type="button" class="catalog-icon-button catalog-nav-close" data-catalog-nav-close aria-label="Close navigation">×</button>
      </div>
      <div class="catalog-framework-badge"><span aria-hidden="true"></span>${escapeHtml(frameworkLabels[framework])}</div>
      <nav class="catalog-sidebar-scroll" aria-label="Documentation">
        <section class="catalog-nav-section">
          <p class="catalog-kicker">Documentation</p>
          <div class="catalog-primary-nav">${primary.map(link).join('')}</div>
        </section>
        <section class="catalog-nav-section">
          <p class="catalog-kicker">Build</p>
          <div class="catalog-primary-nav">${build.map(link).join('')}</div>
        </section>
        <section class="catalog-nav-section catalog-component-nav">
          <div class="catalog-nav-section-heading">
            <p class="catalog-kicker">Components</p>
            <span>${workbenchComponents.length}</span>
          </div>
          ${componentGroups.map(([category, components]) => `
            <div class="catalog-component-nav-group">
              <p>${escapeHtml(category)}</p>
              ${components.map((component) => link({
                path: `/components/${component.slug}`,
                label: component.displayName,
              })).join('')}
            </div>
          `).join('')}
        </section>
      </nav>
      <div class="catalog-nav-footer">
        <a class="catalog-qa-link" href="${withCatalogBasePath(basePath, '/qa/all')}">
          Component QA <span aria-hidden="true">↗</span>
        </a>
        <p>${workbenchComponents.length} components · 3 frameworks</p>
      </div>
    </aside>
  `;
}

export function catalogTopbarHtml(
  basePath: string,
  framework: CatalogFramework,
  currentPath: string,
): string {
  const internalPath = currentPath === '/' ? '/components' : currentPath;
  const component = currentPath.match(/^\/components\/([^/]+)$/)?.[1];
  const markdown = component ? catalogComponentMarkdown(component, framework) : '';
  const searchItems = workbenchComponents.map((candidate) => `
    <a
      href="${withCatalogBasePath(basePath, `/components/${candidate.slug}`)}"
      data-catalog-search-item
      data-search-value="${escapeHtml(`${candidate.displayName} ${catalogComponentDescription(candidate.slug)}`.toLowerCase())}"
    >
      <span>${escapeHtml(candidate.displayName)}</span>
      <small>${escapeHtml(presentationCategory(candidate.slug))}</small>
    </a>
  `).join('');

  return `
    <div class="catalog-topbar" data-catalog-topbar>
      <button type="button" class="catalog-icon-button catalog-nav-open" data-catalog-nav-open aria-label="Open navigation">
        <span aria-hidden="true">☰</span>
      </button>
      <button type="button" class="catalog-search-trigger" data-catalog-search-open>
        <span aria-hidden="true">⌕</span>
        <span>Search components</span>
        <kbd>⌘ K</kbd>
      </button>
      <div class="catalog-topbar-actions">
        <details class="catalog-framework-switcher">
          <summary>${escapeHtml(frameworkShortLabels[framework])}<span aria-hidden="true">⌄</span></summary>
          <div>
            ${catalogFrameworks.map((candidate) => `
              <a
                href="/components/${candidate}${internalPath === '/components' ? '/' : internalPath}"
                ${candidate === framework ? 'aria-current="page"' : ''}
              >
                <span>${escapeHtml(frameworkShortLabels[candidate])}</span>
                <small>${candidate === framework ? 'Current' : frameworkLabels[candidate]}</small>
              </a>
            `).join('')}
          </div>
        </details>
        ${markdown ? `<button type="button" class="catalog-topbar-button catalog-copy-markdown" data-copy-text="${escapeHtml(markdown)}">Copy page</button>` : ''}
        <a class="catalog-topbar-button catalog-github-link" href="https://github.com/21nCo/super-functions/tree/main/uifn" rel="noreferrer">GitHub</a>
        <button type="button" class="catalog-icon-button" data-catalog-theme-toggle aria-label="Switch color theme" title="Switch color theme">
          <span data-catalog-theme-icon aria-hidden="true">◐</span>
        </button>
      </div>
      <dialog class="catalog-search-dialog" data-catalog-search-dialog aria-labelledby="catalog-search-title">
        <div class="catalog-search-dialog-card">
          <div class="catalog-search-dialog-heading">
            <label>
              <span class="sr-only" id="catalog-search-title">Search uifn components</span>
              <span aria-hidden="true">⌕</span>
              <input type="search" data-catalog-global-search placeholder="Search ${workbenchComponents.length} components…" autocomplete="off" />
            </label>
            <button type="button" data-catalog-search-close aria-label="Close search">Esc</button>
          </div>
          <div class="catalog-search-results" data-catalog-search-results>
            ${searchItems}
            <p data-catalog-search-empty hidden>No components match that search.</p>
          </div>
          <div class="catalog-search-footer">
            <span>Type to filter</span>
            <span><kbd>↵</kbd> open first result</span>
          </div>
        </div>
      </dialog>
    </div>
  `;
}

export function catalogComponentDescription(slug: string): string {
  const component = getComponentBySlug(slug);
  if (!component) return 'A framework-native uifn component rendered with the shared design token contract.';
  return descriptionOverrides[component.slug] ??
    `${component.displayName} is a ${normalizedCategory(component.category).toLowerCase()} component with framework-native state, accessibility, and token-based styling.`;
}

export function catalogPageTitle(path: string, fallback: string): string {
  if (path === '/' || path === '/components') return 'Components';
  if (path === '/getting-started') return 'Getting started';
  if (path === '/styling') return 'Styling';
  if (path === '/accessibility') return 'Accessibility';
  if (path === '/registry') return 'Registry and source installation';
  if (path === '/scenarios') return 'Examples';
  if (path === '/sf') return 'Superfunction UI';
  return fallback.replace(/ QA Routes$/, ' QA');
}

export function catalogPageDescription(path: string, route: WorkbenchRoute, framework: CatalogFramework): string {
  if (path === '/' || path === '/components') {
    return `Explore ${workbenchComponents.length} accessible, token-styled components rendered by ${frameworkLabels[framework]}.`;
  }
  if (path === '/getting-started') return `Install the styled ${frameworkShortLabels[framework]} components, add the shared stylesheet, and render your first real uifn component.`;
  if (path === '/styling') return 'Theme the styled component layer with the same semantic CSS variables used by every catalog preview.';
  if (path === '/accessibility') return 'Understand the canonical keyboard, focus, semantics, form, and browser QA contracts behind the rendered components.';
  if (path === '/registry') return `Choose package delivery or copy owned ${frameworkShortLabels[framework]} source with the signed, offline-capable uifn registry.`;
  if (route.family === 'component' && route.slug) return catalogComponentDescription(route.slug);
  if (path === '/hooks') return `Framework-native utilities for media queries, clipboard interactions, and browser behavior in ${frameworkLabels[framework]}.`;
  if (route.family === 'pattern') return 'Product-ready compositions built from uifn component and state contracts.';
  if (route.family === 'sf') return 'Application panels designed for Superfunction products and real backend client integration.';
  if (route.family === 'scenario') return 'Complete interface examples showing components working together in realistic product flows.';
  if (route.family === 'qa') return 'Developer diagnostics for geometry, keyboard behavior, states, themes, and regression testing.';
  return `Actual uifn output rendered through ${frameworkLabels[framework]}.`;
}

export function catalogPageKind(path: string, route: WorkbenchRoute): string {
  if (path === '/' || path === '/components') return 'gallery';
  if (route.family === 'guide') return 'guide';
  if (path.startsWith('/hooks')) return 'hook';
  if (route.family === 'qa' || path.includes('/qa')) return 'qa';
  return route.family;
}

export function updateCatalogDocumentMetadata(
  title: string,
  description: string,
  framework: CatalogFramework,
  currentPath: string,
): void {
  const documentTitle = `${title} – uifn ${frameworkShortLabels[framework]}`;
  const internalPath = currentPath === '/' ? '/' : currentPath;
  const canonicalUrl = `https://uifn.dev/components/${framework}${internalPath}`;
  document.title = documentTitle;
  setCatalogMeta('name', 'description', description);
  setCatalogMeta('property', 'og:title', documentTitle);
  setCatalogMeta('property', 'og:description', description);
  setCatalogMeta('property', 'og:url', canonicalUrl);
  setCatalogMeta('name', 'twitter:title', documentTitle);
  setCatalogMeta('name', 'twitter:description', description);
  let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.rel = 'canonical';
    document.head.append(canonical);
  }
  canonical.href = canonicalUrl;
}

export function catalogComponentPropsForSlug(slug: ComponentSlug, route: WorkbenchRoute): Record<string, unknown> {
  if (route.path !== `/components/${slug}`) return componentPropsForSlug(slug, route);
  const slugId: string = slug;

  const showcaseItems = slugId === 'context-menu' || slugId === 'menu' || slugId === 'menubar'
    ? [
        { value: 'duplicate', label: 'Duplicate project' },
        { value: 'rename', label: 'Rename project' },
        { value: 'delete', label: 'Delete project' },
      ]
    : slug === 'accordion'
      ? [
          { value: 'account', label: 'Account settings' },
          { value: 'security', label: 'Security and access' },
          { value: 'billing', label: 'Billing and plans' },
        ]
      : [
          { value: 'member', label: 'Member' },
          { value: 'admin', label: 'Administrator' },
          { value: 'viewer', label: 'Viewer', disabled: true },
        ];
  const base = {
    'aria-label': `${getComponentBySlug(slug)?.displayName ?? humanize(slug)} example`,
    className: `workbench-uifn-root workbench-${slug} catalog-uifn-root`,
    variant: 'primary',
    size: 'md',
    surface: 'raised',
    surfaceDepth: 1,
    loading: route.fixtureId === 'loading',
    disabled: route.fixtureId === 'disabled',
    invalid: route.fixtureId === 'invalid',
    active: route.fixtureId === 'active',
    selected: route.fixtureId === 'selected',
    open: undefined,
    defaultOpen: false,
    defaultChecked: false,
    checked: undefined,
    defaultValue: ['input', 'date-input', 'number-input', 'password-input'].includes(slugId)
      ? undefined
      : slug === 'slider'
        ? '64'
        : slug === 'pagination'
          ? '2'
          : slug === 'tabs'
            ? 'overview'
            : slug === 'toggle-group'
              ? 'center'
              : '',
    value: undefined,
    placeholder: slugId === 'input'
      ? 'you@company.com'
      : slugId === 'pin-input'
        ? '000000'
          : 'Search…',
    items: showcaseItems,
  };

  if (slugId === 'tree-view') {
    return {
      ...base,
      items: [
        { value: 'workspace', label: 'Workspace' },
        { value: 'projects', label: 'Projects' },
        { value: 'settings', label: 'Settings' },
      ],
    };
  }

  if (slugId === 'date-input' || slugId === 'date-picker') {
    return {
      ...base,
      value: '2026-07-16',
      min: '2026-07-01',
      max: '2026-07-31',
      locale: 'en-US',
      timeZone: 'UTC',
      disabledDates: ['2026-07-20'],
    };
  }

  if (slugId === 'autocomplete' || slugId === 'combobox') {
    return {
      ...base,
      items: [
        { id: 'create', label: 'Create new project' },
        { id: 'invite', label: 'Invite a teammate' },
        { id: 'deploy', label: 'Deploy production' },
      ],
    };
  }

  if (slugId === 'splitter') {
    return {
      ...base,
      sizes: [38, 62],
      orientation: 'horizontal',
      nested: false,
    };
  }

  return base;
}

export function catalogComponentGalleryHtml(basePath: string, framework: CatalogFramework): string {
  const sections = groupedComponents()
    .map(([category, components]) => `
      <section class="catalog-category" data-catalog-category="${escapeHtml(category)}">
        <div class="catalog-category-heading">
          <div>
            <p class="catalog-kicker">${escapeHtml(category)}</p>
            <h2>${escapeHtml(category)} components</h2>
          </div>
          <span>${components.length}</span>
        </div>
        <div class="catalog-component-grid">
          ${components.map((component) => `
            <a
              class="catalog-component-card"
              data-catalog-component-card
              data-component-slug="${component.slug}"
              data-search-value="${escapeHtml(`${component.displayName} ${component.category} ${catalogComponentDescription(component.slug)}`.toLowerCase())}"
              href="${withCatalogBasePath(basePath, `/components/${component.slug}`)}"
            >
              <span class="catalog-component-preview" data-preview-slug="${component.slug}" aria-hidden="true">
                <span></span><span></span><span></span>
              </span>
              <span class="catalog-component-card-copy">
                <strong>${escapeHtml(component.displayName)}</strong>
                <small>${escapeHtml(catalogComponentDescription(component.slug))}</small>
              </span>
              <span class="catalog-card-arrow" aria-hidden="true">↗</span>
            </a>
          `).join('')}
        </div>
      </section>
    `).join('');

  return `
    <section class="catalog-hero">
      <div>
        <span class="catalog-pill">${escapeHtml(frameworkLabels[framework])}</span>
        <h2>Build polished product interfaces from accessible primitives.</h2>
        <p>Every example below is rendered through the actual ${escapeHtml(frameworkLabels[framework])} package and styled with the shared uifn token contract.</p>
      </div>
      <div class="catalog-hero-stats" aria-label="Catalog inventory">
        <span><strong>${workbenchComponents.length}</strong> components</span>
        <span><strong>3</strong> frameworks</span>
        <span><strong>1</strong> shared contract</span>
      </div>
    </section>
    <div class="catalog-toolbar">
      <label>
        <span class="sr-only">Search components</span>
        <input type="search" data-catalog-search placeholder="Search components…" autocomplete="off" />
      </label>
      <span data-catalog-search-result>${workbenchComponents.length} components</span>
    </div>
    <div data-catalog-component-groups>${sections}</div>
  `;
}

export function catalogGuideHtml(
  path: string,
  framework: CatalogFramework,
  basePath: string,
): string {
  const packagePath = `@uifn/components-${framework}`;
  const packageCommand = `npm install ${packagePath}`;
  const sourceCommand = `npx @uifn/registry add button --framework ${framework} --cwd .`;
  const buttonSnippet = catalogCodeSnippet('button', framework);
  const componentHref = withCatalogBasePath(basePath, '/components/button');
  const qaHref = withCatalogBasePath(basePath, '/qa/all');

  if (path === '/getting-started') {
    return `
      <article class="catalog-guide" data-catalog-guide="getting-started">
        <nav class="catalog-on-this-page" aria-label="On this page">
          <span>On this page</span>
          <a href="#choose-delivery">Choose delivery</a>
          <a href="#install">Install</a>
          <a href="#render">Render</a>
          <a href="#architecture">Architecture</a>
        </nav>
        <section class="catalog-guide-intro">
          <p class="catalog-kicker">Start here</p>
          <h2>Use the styled package, or own the generated source.</h2>
          <p>The catalog renders <code>${escapeHtml(packagePath)}</code>. The same canonical component can also be installed as source through <code>@uifn/registry</code>.</p>
        </section>
        <section class="catalog-reference-section" id="choose-delivery">
          <div class="catalog-doc-heading"><div><p class="catalog-kicker">Step 1</p><h2>Choose delivery</h2></div></div>
          <div class="catalog-choice-grid">
            <article><span>Package</span><h3>Upgrade centrally</h3><p>Install <code>${escapeHtml(packagePath)}</code> and receive component updates through your package manager.</p></article>
            <article><span>Source</span><h3>Own the files</h3><p>Use the registry CLI to write generated ${escapeHtml(frameworkShortLabels[framework])} source and its lock metadata into your application.</p></article>
          </div>
        </section>
        <section class="catalog-reference-section" id="install">
          <div class="catalog-doc-heading"><div><p class="catalog-kicker">Step 2</p><h2>Install</h2></div></div>
          ${catalogInstallTabsHtml('getting-started', framework, packageCommand, sourceCommand)}
          <p class="catalog-reference-note">Package mode requires your framework peer dependency. Source mode validates and plans the complete write before changing consumer files.</p>
        </section>
        <section class="catalog-reference-section" id="render">
          <div class="catalog-doc-heading"><div><p class="catalog-kicker">Step 3</p><h2>Render a component</h2></div><a class="catalog-inline-link" href="${componentHref}">Open Button docs →</a></div>
          ${catalogCodePanelHtml('getting-started-button', `Button.${frameworkCodeExtension(framework)}`, buttonSnippet)}
          <p class="catalog-reference-note">Import <code>@uifn/components/styles.css</code> once at the application root. The component package stays framework-native; the stylesheet supplies shared recipes and semantic-token defaults.</p>
        </section>
        <section class="catalog-reference-section" id="architecture">
          <div class="catalog-doc-heading"><div><p class="catalog-kicker">Three layers</p><h2>Know what you are installing</h2></div></div>
          <div class="catalog-architecture" aria-label="uifn package architecture">
            <article><span>1</span><strong>@uifn/core</strong><p>Unstyled framework-independent controllers and contracts.</p></article>
            <i aria-hidden="true">→</i>
            <article><span>2</span><strong>@uifn/${framework}</strong><p>Headless ${escapeHtml(frameworkShortLabels[framework])} bindings.</p></article>
            <i aria-hidden="true">→</i>
            <article><span>3</span><strong>${escapeHtml(packagePath)}</strong><p>Styled, precomposed components rendered in this catalog.</p></article>
          </div>
        </section>
      </article>
    `;
  }

  if (path === '/styling') {
    const tokenSnippet = `:root {\n  --uifn-color-accent-solid: #554bd6;\n  --uifn-color-accent-contrast: #ffffff;\n  --uifn-color-surface-raised: #ffffff;\n  --uifn-color-text-primary: #111827;\n  --uifn-color-border-default: #d7dce5;\n  --uifn-radius-md: 0.625rem;\n  --uifn-font-family: Inter, ui-sans-serif, system-ui, sans-serif;\n}`;
    return `
      <article class="catalog-guide" data-catalog-guide="styling">
        <nav class="catalog-on-this-page" aria-label="On this page">
          <span>On this page</span>
          <a href="#stylesheet">Stylesheet</a>
          <a href="#tokens">Tokens</a>
          <a href="#states">States</a>
          <a href="#themes">Themes</a>
        </nav>
        <section class="catalog-guide-intro">
          <p class="catalog-kicker">Styled component layer</p>
          <h2>Change the theme without replacing behavior.</h2>
          <p>The <code>@uifn/components-*</code> packages expose component anatomy and state attributes while the shared stylesheet consumes semantic CSS variables.</p>
        </section>
        <section class="catalog-reference-section" id="stylesheet">
          <div class="catalog-doc-heading"><div><p class="catalog-kicker">Required once</p><h2>Import the component stylesheet</h2></div></div>
          ${catalogCodePanelHtml('styling-import', 'app.css', `@import '@uifn/components/styles.css';`)}
        </section>
        <section class="catalog-reference-section" id="tokens">
          <div class="catalog-doc-heading"><div><p class="catalog-kicker">Semantic variables</p><h2>Override tokens at your theme boundary</h2></div></div>
          ${catalogCodePanelHtml('styling-tokens', 'theme.css', tokenSnippet)}
          <p class="catalog-reference-note">These variables are consumed by the checked-in component stylesheet. Unset values fall back to system colors and component defaults.</p>
        </section>
        <section class="catalog-reference-section" id="states">
          <div class="catalog-doc-heading"><div><p class="catalog-kicker">Stable selectors</p><h2>Style declared anatomy and state</h2></div></div>
          ${catalogCodePanelHtml('styling-states', 'overrides.css', `[data-uifn-component='button'][data-loading='true'] {\n  cursor: wait;\n}\n\n[data-uifn-component='dialog'] [data-uifn-part='content'] {\n  max-width: 36rem;\n}`)}
          <p class="catalog-reference-note">Component and part selectors shown here are emitted by the actual styled packages and correspond to the anatomy tables on each component page.</p>
        </section>
        <section class="catalog-reference-section" id="themes">
          <div class="catalog-doc-heading"><div><p class="catalog-kicker">Catalog proof</p><h2>Inspect every theme</h2></div><a class="catalog-inline-link" href="${withCatalogBasePath(basePath, '/qa/themes')}">Open theme QA →</a></div>
          <div class="catalog-theme-samples" aria-label="Catalog theme samples">
            <span data-theme-sample="light">Light</span>
            <span data-theme-sample="dark">Dark</span>
            <span data-theme-sample="high-contrast-light">High contrast light</span>
            <span data-theme-sample="high-contrast-dark">High contrast dark</span>
          </div>
        </section>
      </article>
    `;
  }

  if (path === '/accessibility') {
    return `
      <article class="catalog-guide" data-catalog-guide="accessibility">
        <nav class="catalog-on-this-page" aria-label="On this page">
          <span>On this page</span>
          <a href="#contract">Contract</a>
          <a href="#keyboard">Keyboard</a>
          <a href="#browser-qa">Browser QA</a>
          <a href="#consumer">Consumer duties</a>
        </nav>
        <section class="catalog-guide-intro">
          <p class="catalog-kicker">Evidence, not a badge</p>
          <h2>Accessibility requirements live beside component behavior.</h2>
          <p>Every canonical primitive records its native semantics, accessible-name sources, keyboard model, focus rules, announcements, pointer behavior, user-preference behavior, and WCAG references.</p>
        </section>
        <section class="catalog-reference-section" id="contract">
          <div class="catalog-doc-heading"><div><p class="catalog-kicker">Canonical catalog</p><h2>What each component contract records</h2></div></div>
          <div class="catalog-contract-grid">
            <article><strong>Semantics</strong><p>Native element guidance, roles, names, descriptions, and state relationships.</p></article>
            <article><strong>Interaction</strong><p>Keyboard keys, pointer and touch behavior, focus movement, containment, and restoration.</p></article>
            <article><strong>Preferences</strong><p>Reduced motion, forced colors, reflow at zoom, and right-to-left behavior.</p></article>
            <article><strong>Forms and status</strong><p>Native submission, reset, validation, live regions, and announcement policy where applicable.</p></article>
          </div>
        </section>
        <section class="catalog-reference-section" id="keyboard">
          <div class="catalog-doc-heading"><div><p class="catalog-kicker">Per primitive</p><h2>Keyboard behavior follows the declared model</h2></div></div>
          <p class="catalog-prose">Disclosure, overlay, menu navigation, selection collection, range gesture, date and color, forms input, and status feedback each have distinct keyboard and focus rules. Component pages surface the exact states and anatomy for the selected primitive.</p>
        </section>
        <section class="catalog-reference-section" id="browser-qa">
          <div class="catalog-doc-heading"><div><p class="catalog-kicker">Runnable routes</p><h2>Inspect behavior in a browser</h2></div><a class="catalog-inline-link" href="${qaHref}">Open all QA routes →</a></div>
          <div class="catalog-qa-grid">
            <a href="${withCatalogBasePath(basePath, '/qa/keyboard')}"><strong>Keyboard</strong><span>Focus and key handling</span></a>
            <a href="${withCatalogBasePath(basePath, '/qa/overlays')}"><strong>Overlays</strong><span>Placement and dismissal</span></a>
            <a href="${withCatalogBasePath(basePath, '/qa/forms')}"><strong>Forms</strong><span>Labels, values, and reset</span></a>
            <a href="${withCatalogBasePath(basePath, '/qa/responsive')}"><strong>Responsive</strong><span>Reflow and clipping</span></a>
            <a href="${withCatalogBasePath(basePath, '/qa/themes')}"><strong>Themes</strong><span>Contrast modes and tokens</span></a>
          </div>
        </section>
        <section class="catalog-reference-section" id="consumer">
          <div class="catalog-doc-heading"><div><p class="catalog-kicker">Application responsibility</p><h2>What uifn cannot decide for you</h2></div></div>
          <ul class="catalog-check-list">
            <li>Supply visible labels or explicit accessible names where the component contract requires them.</li>
            <li>Use titles, descriptions, errors, and status messages that describe your actual workflow.</li>
            <li>Retest composed product flows, custom styles, route changes, and application-level focus behavior.</li>
            <li>Preserve the component anatomy and semantic relationships when extending presentation.</li>
          </ul>
        </section>
      </article>
    `;
  }

  if (path === '/registry') {
    return `
      <article class="catalog-guide" data-catalog-guide="registry">
        <nav class="catalog-on-this-page" aria-label="On this page">
          <span>On this page</span>
          <a href="#source-install">Install source</a>
          <a href="#inspect">Inspect</a>
          <a href="#update">Update</a>
          <a href="#metadata">Metadata</a>
        </nav>
        <section class="catalog-guide-intro">
          <p class="catalog-kicker">@uifn/registry</p>
          <h2>Copy the generated component source you choose to own.</h2>
          <p>The registry bundles the canonical catalog, verifies its detached signature, plans writes before mutation, and records installed-file hashes and provenance.</p>
        </section>
        <section class="catalog-reference-section" id="source-install">
          <div class="catalog-doc-heading"><div><p class="catalog-kicker">Add</p><h2>Preview, then install</h2></div></div>
          ${catalogCodePanelHtml('registry-add', 'Terminal', `npx @uifn/registry add button --framework ${framework} --cwd . --dry-run --json\nnpx @uifn/registry add button --framework ${framework} --cwd . --json`)}
        </section>
        <section class="catalog-reference-section" id="inspect">
          <div class="catalog-doc-heading"><div><p class="catalog-kicker">Read-only commands</p><h2>List, inspect, validate, and diagnose</h2></div></div>
          ${catalogCodePanelHtml('registry-inspect', 'Terminal', `npx @uifn/registry list --json\nnpx @uifn/registry info button --framework ${framework} --json\nnpx @uifn/registry validate --json\nnpx @uifn/registry doctor --cwd . --json`)}
        </section>
        <section class="catalog-reference-section" id="update">
          <div class="catalog-doc-heading"><div><p class="catalog-kicker">Local-change aware</p><h2>Diff or update installed source</h2></div></div>
          ${catalogCodePanelHtml('registry-update', 'Terminal', `npx @uifn/registry diff --cwd . --json\nnpx @uifn/registry update button --cwd . --dry-run --json`)}
          <p class="catalog-reference-note">The registry reports local, base, and incoming hashes and does not silently overwrite locally changed component files.</p>
        </section>
        <section class="catalog-reference-section" id="metadata">
          <div class="catalog-doc-heading"><div><p class="catalog-kicker">Consumer files</p><h2>What source mode writes</h2></div></div>
          <div class="catalog-file-tree">
            <code>components/uifn/${framework}/…</code><span>Generated component source</span>
            <code>.uifn/registry.lock</code><span>Versions, dependencies, hashes, and provenance</span>
            <code>.uifn/selected-components.json</code><span>Selected source-mode component index</span>
            <code>package.json</code><span>Compatible dependencies, only when missing</span>
          </div>
        </section>
      </article>
    `;
  }

  return '';
}

export function catalogDemoCodeHtml(slug: string, framework: CatalogFramework): string {
  const component = getComponentBySlug(slug);
  if (!component) return '';
  return catalogCodePanelHtml(
    `preview-${component.slug}-${framework}`,
    `${component.displayName}.${frameworkCodeExtension(framework)}`,
    catalogCodeSnippet(component.slug, framework),
  );
}

export function catalogComponentCodeSnippet(
  slug: ComponentSlug,
  framework: CatalogFramework,
): string {
  return catalogCodeSnippet(slug, framework);
}

function catalogComponentExamplesHtml(
  slug: ComponentSlug,
  basePath: string,
  statesHref: string,
  qaHref: string,
  demoStates: readonly string[],
  behaviors: readonly string[],
): string {
  const namedExamples = catalogNamedExamples[slug as keyof typeof catalogNamedExamples] as
    | readonly CatalogExampleDefinition[]
    | undefined;
  const examples: readonly CatalogExampleDefinition[] = namedExamples ?? [
    {
      kicker: 'Live example',
      title: 'Default interaction',
      description: 'Use the real component rendered above and inspect its visual and keyboard behavior.',
      target: 'preview',
    },
    {
      kicker: 'State matrix',
      title: demoStates.map(catalogDemoFixtureLabel).join(', '),
      description: 'Inspect supported visual and semantic states using the same framework package.',
      target: 'states',
    },
    {
      kicker: 'Behavior cases',
      title: behaviors.map(humanize).join(', '),
      description: 'Open focus, responsive, direction, form, and regression fixtures for this component.',
      target: 'qa',
    },
  ];

  return examples.map((example) => {
    const href = example.target === 'preview'
      ? '#preview'
      : example.target === 'states'
        ? statesHref
        : example.target === 'qa'
          ? qaHref
          : withCatalogBasePath(basePath, example.target);
    return `<a href="${href}"><span>${escapeHtml(example.kicker)}</span><strong>${escapeHtml(example.title)}</strong><p>${escapeHtml(example.description)}</p></a>`;
  }).join('');
}

export function catalogComponentDetailsHtml(slug: string, framework: CatalogFramework, basePath: string): string {
  const component = getComponentBySlug(slug);
  if (!component) return '';
  const snippet = catalogCodeSnippet(component.slug, framework);
  const qaHref = withCatalogBasePath(basePath, `/components/${component.slug}/qa`);
  const statesHref = withCatalogBasePath(basePath, `/components/${component.slug}/states`);
  const packagePath = `@uifn/components-${framework}`;
  const peer = framework === 'solid' ? 'solid-js' : framework;
  const propRows = catalogPropRows(component, framework);
  const behaviors = component.behaviors.length ? component.behaviors : component.profiles;
  const packageCommand = `npm install ${packagePath}`;
  const sourceCommand = `npx @uifn/registry add ${component.slug} --framework ${framework} --cwd .`;
  const accessibility = catalogAccessibilitySummary(component.slug);
  const demoStates = catalogDemoFixtureIds(component.slug, component.states);
  const contract = STYLED_COMPONENT_CATALOG.find((candidate) => candidate.id === component.slug);
  if (!contract) return '';
  const api = contract.api;
  const componentIndex = workbenchComponents.findIndex((candidate) => candidate.slug === component.slug);
  const previous = componentIndex > 0 ? workbenchComponents[componentIndex - 1] : undefined;
  const next = componentIndex < workbenchComponents.length - 1 ? workbenchComponents[componentIndex + 1] : undefined;

  return `
    <section class="catalog-doc-section" data-catalog-component-details="${component.slug}">
      <nav class="catalog-on-this-page" aria-label="On this page">
        <span>On this page</span>
        <a href="#installation">Installation</a>
        <a href="#usage">Usage</a>
        <a href="#api-reference">API reference</a>
        <a href="#events">Events</a>
        <a href="#parts">Parts</a>
        <a href="#styling-api">Styling API</a>
        <a href="#accessibility">Accessibility</a>
        <a href="#limitations">Limitations</a>
        <a href="#examples">Examples</a>
      </nav>

      <section class="catalog-reference-section" id="installation" data-catalog-doc-installation>
        <div class="catalog-doc-heading">
          <div><p class="catalog-kicker">Get started</p><h2>Installation</h2></div>
        </div>
        ${catalogInstallTabsHtml(component.slug, framework, packageCommand, sourceCommand)}
        <p class="catalog-reference-note">Import the compound from <code>${escapeHtml(packagePath)}</code>, and import <code>@uifn/components/styles.css</code> once at your application root. Your application supplies the compatible <code>${escapeHtml(peer)}</code> peer dependency.</p>
      </section>

      <section class="catalog-reference-section" id="usage" data-catalog-doc-usage>
        <div class="catalog-doc-heading">
          <div><p class="catalog-kicker">Framework-native</p><h2>Usage</h2></div>
          <div class="catalog-doc-links"><a href="${statesHref}">View states</a><a href="${qaHref}">Open QA cases</a></div>
        </div>
        ${catalogCodePanelHtml(`${component.slug}-${framework}-usage`, `${component.displayName}.${frameworkCodeExtension(framework)}`, snippet, 'code')}
        <p class="catalog-reference-note" data-catalog-snippet-source>Generated from the published <code>${escapeHtml(component.slug)}</code> demo fixture and its real named exports; the catalog does not maintain a separate handwritten component shape.</p>
      </section>

      <section class="catalog-reference-section" id="api-reference" data-catalog-doc-api>
        <div class="catalog-doc-heading"><div><p class="catalog-kicker">Contract</p><h2>API reference</h2></div></div>
        <div class="catalog-api-summary">
          <article><span>Category</span><strong>${escapeHtml(component.category)}</strong></article>
          <article><span>States</span><strong>${component.states.length}</strong></article>
          <article><span>Composition</span><strong>Open compound</strong></article>
          <article><span>Anatomy parts</span><strong>${component.anatomy.length}</strong></article>
        </div>
        <h3>Props</h3>
        <div class="catalog-table-wrap">
          <table class="catalog-api-table">
            <thead><tr><th>Prop</th><th>Type</th><th>Default</th><th>Description</th></tr></thead>
            <tbody>${propRows.map((row) => `<tr data-catalog-prop="${escapeHtml(row.name)}"><td><code>${escapeHtml(row.name)}</code></td><td><code>${escapeHtml(row.type)}</code></td><td><code>${escapeHtml(row.defaultValue)}</code></td><td>${escapeHtml(row.description)}</td></tr>`).join('')}</tbody>
          </table>
        </div>
        <h3>Controller and context ownership</h3>
        <div class="catalog-accessibility-summary" data-catalog-controller-api>
          <article><span>Core runtime</span><p><code>${escapeHtml(api.ownership.core)}</code></p></article>
          <article><span>State and actions</span><p><code>${escapeHtml(api.ownership.stateType)}</code> · <code>${escapeHtml(api.ownership.actionsType)}</code></p></article>
          <article><span>Parts</span><p><code>${escapeHtml(api.ownership.partsType)}</code></p></article>
          <article><span>DOM owner</span><p>${escapeHtml(api.ownership.dom)}</p></article>
        </div>
        <div class="catalog-file-tree">
          ${Object.entries(api.ownership.contexts).map(([name, value]) => `<code>${escapeHtml(name)}</code><span>${escapeHtml(value)}</span>`).join('')}
        </div>
      </section>

      <section class="catalog-reference-section" id="events" data-catalog-doc-events>
        <div class="catalog-doc-heading"><div><p class="catalog-kicker">Typed transitions</p><h2>Events and callbacks</h2></div></div>
        ${api.events.length ? `
          <div class="catalog-table-wrap">
            <table class="catalog-api-table">
              <thead><tr><th>Event</th><th>Complete signature</th><th>Source</th></tr></thead>
              <tbody>${api.events.map((event) => `<tr data-catalog-event="${escapeHtml(event.type)}"><td><code>${escapeHtml(event.type)}</code></td><td><code>${escapeHtml(event.signature)}</code></td><td>${escapeHtml(event.source)}</td></tr>`).join('')}</tbody>
            </table>
          </div>
        ` : '<p class="catalog-reference-note">This static contract declares no controller transition events. Native element events remain available through the intrinsic element props.</p>'}
        <h3>Controlled callbacks</h3>
        ${api.callbacks.length ? `
          <div class="catalog-table-wrap">
            <table class="catalog-api-table">
              <thead><tr><th>Callback</th><th>Signature</th><th>Contract</th></tr></thead>
              <tbody>${api.callbacks.map((callback) => `<tr data-catalog-callback="${escapeHtml(callback.name)}"><td><code>${escapeHtml(callback.name)}</code></td><td><code>${escapeHtml(callback.signature)}</code></td><td>${escapeHtml(callback.description)}</td></tr>`).join('')}</tbody>
            </table>
          </div>
        ` : '<p class="catalog-reference-note">No controlled callback is declared. Native DOM event props are forwarded without a framework-owned behavior fork.</p>'}
      </section>

      <section class="catalog-reference-section" id="parts" data-catalog-doc-parts>
        <div class="catalog-doc-heading"><div><p class="catalog-kicker">Open compound</p><h2>Per-part API</h2></div></div>
        <div class="catalog-anatomy-grid">
          ${api.parts.map((part) => `<article data-catalog-anatomy-part="${escapeHtml(part.id)}"><code>${escapeHtml(part.exportName)}</code><p>${escapeHtml(anatomyDescription(part.id))}</p><small>${escapeHtml(part.element)} · ${escapeHtml(part.cardinality)}${part.valueProp ? ` · required value: ${escapeHtml(part.valueProp.type)}` : ''}</small></article>`).join('')}
        </div>
        <div class="catalog-table-wrap">
          <table class="catalog-api-table">
            <thead><tr><th>Part</th><th>Native element</th><th>Cardinality</th><th>${escapeHtml(frameworkShortLabels[framework])} props</th></tr></thead>
            <tbody>${api.parts.map((part) => `<tr data-catalog-part-api="${escapeHtml(part.id)}"><td><code>${escapeHtml(part.exportName)}</code></td><td><code>${escapeHtml(part.element)}</code></td><td>${escapeHtml(part.cardinality)}</td><td>${part.sharedProps[framework].map((prop) => `<code>${escapeHtml(prop)}</code>`).join(' · ')}</td></tr>`).join('')}</tbody>
          </table>
        </div>
      </section>

      <section class="catalog-reference-section" id="styling-api" data-catalog-doc-styling-api>
        <div class="catalog-doc-heading"><div><p class="catalog-kicker">Stable selectors</p><h2>Data attributes and CSS variables</h2></div></div>
        <h3>Data attributes</h3>
        <div class="catalog-table-wrap">
          <table class="catalog-api-table">
            <thead><tr><th>Attribute</th><th>Values</th><th>Parts</th><th>Stability</th></tr></thead>
            <tbody>${api.dataAttributes.map((attribute) => `<tr data-catalog-data-attribute="${escapeHtml(attribute.name)}"><td><code>${escapeHtml(attribute.name)}</code></td><td><code>${escapeHtml(attribute.value)}</code></td><td>${escapeHtml(attribute.parts)}</td><td>${escapeHtml(attribute.stability)}</td></tr>`).join('')}</tbody>
          </table>
        </div>
        <h3>CSS variables</h3>
        <div class="catalog-anatomy-grid" data-catalog-css-variables>
          ${api.cssVariables.map((variable) => `<article><code>${escapeHtml(variable.name)}</code><p>${escapeHtml(variable.scope)} token available to ${component.displayName}.</p></article>`).join('')}
        </div>
      </section>

      <section class="catalog-reference-section" id="accessibility" data-catalog-doc-accessibility>
        <div class="catalog-doc-heading">
          <div><p class="catalog-kicker">Canonical requirements</p><h2>Accessibility contract</h2></div>
          <a class="catalog-inline-link" href="${qaHref}">Run component QA →</a>
        </div>
        <div class="catalog-accessibility-summary">
          <article>
            <span>Native semantics</span>
            <p>${escapeHtml(accessibility.nativeSemantics)}</p>
          </article>
          <article>
            <span>Keyboard</span>
            <p>${escapeHtml(accessibility.keyboard)}</p>
          </article>
          <article>
            <span>Focus</span>
            <p>${escapeHtml(accessibility.focus)}</p>
          </article>
          <article>
            <span>WCAG references</span>
            <p>${escapeHtml(accessibility.wcag)}</p>
          </article>
        </div>
        <p class="catalog-reference-note">These requirements come from the canonical ${escapeHtml(component.displayName)} catalog entry. Application copy, labels, custom styling, and composed workflows still require product-level testing.</p>
      </section>

      <section class="catalog-reference-section" id="limitations" data-catalog-doc-limitations>
        <div class="catalog-doc-heading"><div><p class="catalog-kicker">Explicit boundaries</p><h2>Known limitations</h2></div></div>
        <ul class="catalog-reference-list">
          ${api.limitations.map((limitation) => `<li>${escapeHtml(limitation)}</li>`).join('')}
        </ul>
      </section>

      <section class="catalog-reference-section" id="examples" data-catalog-doc-examples>
        <div class="catalog-doc-heading"><div><p class="catalog-kicker">Explore</p><h2>Examples and states</h2></div></div>
        <div class="catalog-example-grid">
          ${catalogComponentExamplesHtml(component.slug, basePath, statesHref, qaHref, demoStates, behaviors)}
        </div>
      </section>

      <div class="catalog-capability-grid">
        <article><span>Accessibility</span><strong>Keyboard and ARIA contract</strong><p>Semantic anatomy, focus behavior, and state attributes are exercised in a real browser.</p></article>
        <article><span>Styling</span><strong>Tokens and recipe variants</strong><p>Theme values flow through CSS variables so product teams can brand without rewriting behavior.</p></article>
        <article><span>Framework</span><strong>Native ${escapeHtml(frameworkLabels[framework])}</strong><p>The preview is the real framework export, not a screenshot or simulated DOM.</p></article>
      </div>

      <nav class="catalog-pagination" aria-label="Component documentation">
        ${previous ? `<a rel="prev" href="${withCatalogBasePath(basePath, `/components/${previous.slug}`)}"><span>← Previous</span><strong>${escapeHtml(previous.displayName)}</strong></a>` : '<span></span>'}
        ${next ? `<a rel="next" href="${withCatalogBasePath(basePath, `/components/${next.slug}`)}"><span>Next →</span><strong>${escapeHtml(next.displayName)}</strong></a>` : '<span></span>'}
      </nav>
    </section>
  `;
}

function catalogInstallTabsHtml(
  id: string,
  framework: CatalogFramework,
  packageCommand: string,
  sourceCommand: string,
): string {
  const safeId = id.replace(/[^a-z0-9-]/gi, '-');
  const packagePath = `@uifn/components-${framework}`;
  const sourceArgs = sourceCommand.replace(/^npx @uifn\/registry\s*/, '');
  const managers = [
    {
      id: 'npm',
      package: packageCommand,
      source: sourceCommand,
    },
    {
      id: 'pnpm',
      package: `pnpm add ${packagePath}`,
      source: `pnpm dlx @uifn/registry ${sourceArgs}`,
    },
    {
      id: 'yarn',
      package: `yarn add ${packagePath}`,
      source: `yarn dlx @uifn/registry ${sourceArgs}`,
    },
    {
      id: 'bun',
      package: `bun add ${packagePath}`,
      source: `bunx @uifn/registry ${sourceArgs}`,
    },
  ];

  return `
    <div class="catalog-install" data-catalog-install data-install-mode="package">
      <div class="catalog-tab-row">
        <div class="catalog-segmented-tabs" role="tablist" aria-label="Delivery mode">
          <button type="button" role="tab" aria-selected="true" aria-controls="${safeId}-package-panel" data-catalog-install-mode="package">Package</button>
          <button type="button" role="tab" aria-selected="false" aria-controls="${safeId}-source-panel" data-catalog-install-mode="source">Source</button>
        </div>
        <div class="catalog-package-tabs" role="tablist" aria-label="Package manager">
          ${managers.map((manager, index) => `
            <button
              type="button"
              role="tab"
              aria-selected="${index === 0 ? 'true' : 'false'}"
              data-catalog-package-manager="${manager.id}"
              data-package-command="${escapeHtml(manager.package)}"
              data-source-command="${escapeHtml(manager.source)}"
            >${manager.id}</button>
          `).join('')}
        </div>
      </div>
      <div class="catalog-install-panel" id="${safeId}-package-panel" role="tabpanel" data-catalog-install-panel="package">
        <div>
          <span>Package dependency</span>
          <small>${escapeHtml(frameworkLabels[framework])}</small>
        </div>
        <pre><code data-catalog-install-command>${escapeHtml(packageCommand)}</code></pre>
        <button type="button" class="catalog-copy-button" data-copy-nearest-code>Copy<span class="sr-only"> install command</span></button>
      </div>
      <div class="catalog-install-panel" id="${safeId}-source-panel" role="tabpanel" data-catalog-install-panel="source" hidden>
        <div>
          <span>Owned source</span>
          <small>@uifn/registry</small>
        </div>
        <pre><code data-catalog-install-command>${escapeHtml(sourceCommand)}</code></pre>
        <button type="button" class="catalog-copy-button" data-copy-nearest-code>Copy<span class="sr-only"> source-install command</span></button>
      </div>
    </div>
  `;
}

function catalogCodePanelHtml(id: string, label: string, code: string, htmlId?: string): string {
  const safeId = id.replace(/[^a-z0-9-]/gi, '-');
  return `
    <div class="catalog-code-panel" ${htmlId ? `id="${htmlId}"` : ''} data-catalog-code-panel>
      <div class="catalog-code-toolbar">
        <span>${escapeHtml(label)}</span>
        <button type="button" class="catalog-copy-button catalog-copy-button-dark" data-copy-target="${safeId}-code">Copy code</button>
      </div>
      <pre class="catalog-code" tabindex="0" aria-label="${escapeHtml(label)} code"><code id="${safeId}-code">${escapeHtml(code)}</code></pre>
    </div>
  `;
}

function catalogAccessibilitySummary(slug: string): {
  nativeSemantics: string;
  keyboard: string;
  focus: string;
  wcag: string;
} {
  const entry = CATALOG_ACCESSIBILITY[slug as keyof typeof CATALOG_ACCESSIBILITY];
  if (!entry) throw new Error(`Missing canonical accessibility contract for ${slug}.`);
  const rules = entry.rules;
  return {
    nativeSemantics: rules.nativeSemantics,
    keyboard: rules.keyboard.keys.join(', '),
    focus: rules.focus.map(humanize).join(', '),
    wcag: rules.wcag.join(', '),
  };
}

function catalogComponentMarkdown(slug: string, framework: CatalogFramework): string {
  const component = getComponentBySlug(slug);
  if (!component) return '';
  const accessibility = catalogAccessibilitySummary(slug);
  const packagePath = `@uifn/components-${framework}`;
  const contract = STYLED_COMPONENT_CATALOG.find((candidate) => candidate.id === component.slug);
  if (!contract) return '';
  const api = contract.api;
  const props = catalogPropRows(component, framework)
    .map((row) => `| \`${row.name}\` | \`${row.type}\` | \`${row.defaultValue}\` | ${row.description} |`)
    .join('\n');
  return `# ${component.displayName}

${catalogComponentDescription(slug)}

## Install

\`\`\`sh
npm install ${packagePath}
\`\`\`

## Usage

\`\`\`${frameworkCodeExtension(framework)}
${catalogCodeSnippet(component.slug, framework)}
\`\`\`

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
${props}

## Anatomy

${api.parts.map((part) => `- \`${part.exportName}\` (\`${part.element}\`, ${part.cardinality}): ${anatomyDescription(part.id)}`).join('\n')}

## Controller and contexts

- Core: \`${api.ownership.core}\`
- State: \`${api.ownership.stateType}\`
- Actions: \`${api.ownership.actionsType}\`
- Parts: \`${api.ownership.partsType}\`
- DOM: ${api.ownership.dom}
${Object.entries(api.ownership.contexts).map(([name, value]) => `- ${name}: ${value}`).join('\n')}

## Events

${api.events.length ? api.events.map((event) => `- \`${event.signature}\``).join('\n') : '- Native DOM events only.'}

## Data attributes

${api.dataAttributes.map((attribute) => `- \`${attribute.name}\`: \`${attribute.value}\` on ${attribute.parts}.`).join('\n')}

## CSS variables

${api.cssVariables.map((variable) => `- \`${variable.name}\` (${variable.scope})`).join('\n')}

## Accessibility

- Native semantics: ${accessibility.nativeSemantics}
- Keyboard: ${accessibility.keyboard}
- Focus: ${accessibility.focus}
- WCAG references: ${accessibility.wcag}

## Limitations

${api.limitations.map((limitation) => `- ${limitation}`).join('\n')}
`;
}

interface CatalogPropRow {
  name: string;
  type: string;
  defaultValue: string;
  description: string;
}

function catalogPropRows(component: (typeof workbenchComponents)[number], framework: CatalogFramework): CatalogPropRow[] {
  const contract = STYLED_COMPONENT_CATALOG.find((candidate) => candidate.id === component.slug);
  if (!contract) return [];
  const rows: CatalogPropRow[] = [
    { name: framework === 'react' ? 'className' : 'class', type: 'string', defaultValue: 'undefined', description: 'Adds a consumer class to the root without replacing generated styling hooks.' },
    { name: 'children', type: 'framework content', defaultValue: 'undefined', description: 'Composes the documented compound parts inside the root context.' },
    { name: 'render', type: 'element | render function/snippet', defaultValue: 'undefined', description: 'Replaces the native host while preserving merged semantic props and behavior.' },
    { name: 'environment', type: 'UIFnEnvironment', defaultValue: 'generated per instance', description: 'Overrides deterministic IDs, scheduling, locale, direction, or DOM ownership for advanced integrations and tests.' },
    { name: 'native element props', type: `intrinsic ${contract.parts[0]?.element ?? 'element'} props`, defaultValue: 'native', description: 'Forwards safe native attributes and event handlers to the root element.' },
  ];
  if (framework === 'react') rows.push({ name: 'asChild', type: 'boolean', defaultValue: 'false', description: 'Composes the root into one child while preserving merged refs and semantic props.' });
  for (const input of contract.api.rootProps) {
    rows.push({
      name: input.name,
      type: input.type,
      defaultValue: input.defaultValue,
      description: input.description,
    });
  }
  for (const callback of contract.api.callbacks) rows.push({
    name: callback.name,
    type: callback.signature,
    defaultValue: 'undefined',
    description: callback.description,
  });
  return rows;
}

const anatomyDescriptions: Record<string, string> = {
  root: 'Top-level element that owns component state and data attributes.',
  trigger: 'Interactive control that opens, closes, or toggles the component.',
  content: 'Primary content region associated with the component.',
  item: 'Individual collection or navigation item.',
  label: 'Accessible or visible label for the related control or group.',
  title: 'Primary accessible heading for the surface.',
  description: 'Supporting accessible description for the surface.',
  close: 'Control that closes the current overlay or feedback item.',
  input: 'Native form control used for input and form submission.',
  hiddenInput: 'Native hidden input that carries the value during form submission.',
  option: 'Selectable option within a listbox or command collection.',
  listbox: 'ARIA listbox that contains selectable options.',
  viewport: 'Scrollable viewport for clipped content.',
  scrollbar: 'Visual scrollbar associated with the viewport.',
  thumb: 'Draggable or visual thumb for a slider, switch, or scrollbar.',
  track: 'Track that represents the available range or progress.',
  indicator: 'Visual state or progress indicator.',
  panel: 'Resizable or tab-associated content panel.',
  handle: 'Keyboard and pointer operable resize handle.',
  grid: 'Grid container that organizes calendar or data cells.',
  cell: 'Individual grid or table cell.',
  row: 'Individual table or grid row.',
  table: 'Semantic table surface for structured data.',
  toolbar: 'Controls for filtering, sorting, or acting on content.',
  navigation: 'Navigation region containing application destinations.',
  header: 'Leading region containing title, metadata, or controls.',
  footer: 'Trailing region containing secondary information or actions.',
};

function anatomyDescription(part: string): string {
  return anatomyDescriptions[part] ?? `${humanize(part)} part exposed for composition and styling.`;
}

function frameworkCodeExtension(framework: CatalogFramework): string {
  if (framework === 'svelte') return 'svelte';
  return 'tsx';
}

export function decorateCatalogPreview(scope: ParentNode, route: WorkbenchRoute): void {
  if (route.family !== 'component' || !route.slug || route.path !== `/components/${route.slug}`) return;
  const root = scope.querySelector<HTMLElement>(`[data-uifn-component="${route.slug}"]`);
  if (!root) return;
  const copy = partCopy[route.slug] ?? {};
  for (const [part, text] of Object.entries(copy)) {
    const node = root.querySelector<HTMLElement>(`[data-uifn-part="${part}"]`);
    if (!node) continue;
    node.textContent = text ?? null;
    const interactive = node.matches(
      'button, input:not([type="hidden"]), textarea, select, a[href], [role="button"], [role="checkbox"], [role="combobox"], [role="menuitem"], [role="option"], [role="radio"], [role="slider"], [role="switch"], [role="tab"], [tabindex]:not([tabindex="-1"])'
    );
    if (!text && !interactive) node.setAttribute('aria-hidden', 'true');
  }
}

let catalogShortcutBound = false;
let activeCatalogSearchDialog: HTMLDialogElement | undefined;

export interface CatalogNavigationOptions {
  basePath: string;
  currentPath: string;
  navigate: (internalPath: string) => void;
}

interface CatalogNavigationBinding {
  basePath: string;
  navigate: (internalPath: string) => void;
}

const catalogNavigationBindings = new WeakMap<HTMLElement, CatalogNavigationBinding>();

export function activateCatalogUi(
  scope: ParentNode,
  navigation?: CatalogNavigationOptions,
): void {
  const input = scope.querySelector<HTMLInputElement>('[data-catalog-search]');
  if (input && input.dataset.catalogSearchActive !== 'true') {
    input.dataset.catalogSearchActive = 'true';
    const cards = Array.from(scope.querySelectorAll<HTMLElement>('[data-catalog-component-card]'));
    const groups = Array.from(scope.querySelectorAll<HTMLElement>('[data-catalog-category]'));
    const result = scope.querySelector<HTMLElement>('[data-catalog-search-result]');
    input.addEventListener('input', () => {
      const query = input.value.trim().toLowerCase();
      let visible = 0;
      for (const card of cards) {
        const matches = !query || (card.dataset.searchValue ?? '').includes(query);
        card.hidden = !matches;
        if (matches) visible += 1;
      }
      for (const group of groups) {
        group.hidden = !group.querySelector('[data-catalog-component-card]:not([hidden])');
      }
      if (result) result.textContent = `${visible} component${visible === 1 ? '' : 's'}`;
    });
  }

  for (const install of Array.from(scope.querySelectorAll<HTMLElement>('[data-catalog-install]'))) {
    if (install.dataset.catalogInstallActive === 'true') continue;
    install.dataset.catalogInstallActive = 'true';
    const modeButtons = Array.from(install.querySelectorAll<HTMLButtonElement>('button[data-catalog-install-mode]'));
    const managerButtons = Array.from(install.querySelectorAll<HTMLButtonElement>('button[data-catalog-package-manager]'));
    const panels = Array.from(install.querySelectorAll<HTMLElement>('[data-catalog-install-panel]'));
    const updateCommands = () => {
      const manager = managerButtons.find((button) => button.getAttribute('aria-selected') === 'true') ?? managerButtons[0];
      const mode = install.dataset.installMode === 'source' ? 'source' : 'package';
      for (const panel of panels) {
        const panelMode = panel.dataset.catalogInstallPanel;
        panel.hidden = panelMode !== mode;
        const code = panel.querySelector<HTMLElement>('[data-catalog-install-command]');
        if (code && panelMode === mode && manager) {
          code.textContent = mode === 'source' ? manager.dataset.sourceCommand ?? '' : manager.dataset.packageCommand ?? '';
        }
      }
    };
    for (const button of modeButtons) {
      button.addEventListener('click', () => {
        const mode = button.dataset.catalogInstallMode === 'source' ? 'source' : 'package';
        install.dataset.installMode = mode;
        for (const candidate of modeButtons) candidate.setAttribute('aria-selected', String(candidate === button));
        updateCommands();
      });
    }
    for (const button of managerButtons) {
      button.addEventListener('click', () => {
        for (const candidate of managerButtons) candidate.setAttribute('aria-selected', String(candidate === button));
        updateCommands();
      });
    }
    updateCommands();
  }

  for (const tabs of Array.from(scope.querySelectorAll<HTMLElement>('[data-catalog-demo-tabs]'))) {
    if (tabs.dataset.catalogDemoTabsActive === 'true') continue;
    tabs.dataset.catalogDemoTabsActive = 'true';
    const buttons = Array.from(tabs.querySelectorAll<HTMLButtonElement>('button[data-catalog-demo-tab]'));
    const panels = Array.from(tabs.querySelectorAll<HTMLElement>('[data-catalog-demo-panel]'));
    for (const button of buttons) {
      button.addEventListener('click', () => {
        const tab = button.dataset.catalogDemoTab;
        for (const candidate of buttons) candidate.setAttribute('aria-selected', String(candidate === button));
        for (const panel of panels) panel.hidden = panel.dataset.catalogDemoPanel !== tab;
      });
    }
  }

  for (const button of Array.from(scope.querySelectorAll<HTMLButtonElement>('[data-copy-text], [data-copy-target], [data-copy-nearest-code]'))) {
    if (button.dataset.catalogCopyActive === 'true') continue;
    button.dataset.catalogCopyActive = 'true';
    button.addEventListener('click', () => {
      let value = button.dataset.copyText ?? '';
      const targetId = button.dataset.copyTarget;
      if (targetId) value = document.getElementById(targetId)?.textContent ?? '';
      if (button.hasAttribute('data-copy-nearest-code')) {
        value = button.closest<HTMLElement>('.catalog-install-panel')?.querySelector('code')?.textContent ?? '';
      }
      void copyCatalogText(button, value);
    });
  }

  const shell = scope.querySelector<HTMLElement>('.workbench-shell') ?? (scope instanceof HTMLElement ? scope : undefined);
  if (shell && navigation) {
    activateCatalogNavigation(shell, navigation);
  }
  const themeButton = scope.querySelector<HTMLButtonElement>('[data-catalog-theme-toggle]');
  if (shell && themeButton && themeButton.dataset.catalogThemeActive !== 'true') {
    themeButton.dataset.catalogThemeActive = 'true';
    const requested = new URLSearchParams(window.location.search).get('theme');
    const stored = safeLocalStorageGet('uifn-catalog-theme');
    const preferred = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    applyCatalogTheme(shell, requested || stored || preferred);
    themeButton.addEventListener('click', () => {
      const next = shell.dataset.uifnTheme === 'dark' ? 'light' : 'dark';
      safeLocalStorageSet('uifn-catalog-theme', next);
      applyCatalogTheme(shell, next);
    });
  }

  const openNav = scope.querySelector<HTMLButtonElement>('[data-catalog-nav-open]');
  const closeNav = scope.querySelector<HTMLButtonElement>('[data-catalog-nav-close]');
  if (shell && openNav && openNav.dataset.catalogNavActive !== 'true') {
    openNav.dataset.catalogNavActive = 'true';
    openNav.addEventListener('click', () => {
      shell.dataset.catalogNavOpen = 'true';
      closeNav?.focus();
    });
    closeNav?.addEventListener('click', () => {
      delete shell.dataset.catalogNavOpen;
      openNav.focus();
    });
  }

  const searchDialog = scope.querySelector<HTMLDialogElement>('[data-catalog-search-dialog]');
  const searchOpen = scope.querySelector<HTMLButtonElement>('[data-catalog-search-open]');
  const searchClose = scope.querySelector<HTMLButtonElement>('[data-catalog-search-close]');
  const globalSearch = scope.querySelector<HTMLInputElement>('[data-catalog-global-search]');
  if (searchDialog && searchOpen && globalSearch && searchDialog.dataset.catalogSearchActive !== 'true') {
    searchDialog.dataset.catalogSearchActive = 'true';
    activeCatalogSearchDialog = searchDialog;
    if (!catalogShortcutBound) {
      catalogShortcutBound = true;
      window.addEventListener('keydown', (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
          const active = activeCatalogSearchDialog;
          if (!active || !document.contains(active)) return;
          event.preventDefault();
          if (active.open) active.close();
          else {
            active.showModal();
            active.querySelector<HTMLInputElement>('[data-catalog-global-search]')?.focus();
          }
        }
      });
    }
    const searchItems = Array.from(searchDialog.querySelectorAll<HTMLElement>('[data-catalog-search-item]'));
    const empty = searchDialog.querySelector<HTMLElement>('[data-catalog-search-empty]');
    const filterSearch = () => {
      const query = globalSearch.value.trim().toLowerCase();
      let visible = 0;
      for (const item of searchItems) {
        const matches = !query || (item.dataset.searchValue ?? '').includes(query);
        item.hidden = !matches;
        if (matches) visible += 1;
      }
      if (empty) empty.hidden = visible !== 0;
    };
    searchOpen.addEventListener('click', () => {
      searchDialog.showModal();
      globalSearch.value = '';
      filterSearch();
      queueMicrotask(() => globalSearch.focus());
    });
    searchClose?.addEventListener('click', () => searchDialog.close());
    searchDialog.addEventListener('click', (event) => {
      if (event.target === searchDialog) searchDialog.close();
    });
    globalSearch.addEventListener('input', filterSearch);
    globalSearch.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') searchDialog.close();
      if (event.key === 'Enter') {
        const first = searchItems.find((item) => !item.hidden) as HTMLAnchorElement | undefined;
        if (first) {
          event.preventDefault();
          first.click();
        }
      }
    });
  }
}

function activateCatalogNavigation(
  shell: HTMLElement,
  options: CatalogNavigationOptions,
): void {
  let binding = catalogNavigationBindings.get(shell);
  if (!binding) {
    binding = {
      basePath: options.basePath,
      navigate: options.navigate,
    };
    catalogNavigationBindings.set(shell, binding);
    shell.addEventListener('click', (event) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const target = event.target instanceof Element
        ? event.target
        : null;
      const anchor = target?.closest<HTMLAnchorElement>('a[href]');
      const currentBinding = catalogNavigationBindings.get(shell);
      if (
        !anchor ||
        !currentBinding ||
        !shell.contains(anchor) ||
        anchor.hasAttribute('download') ||
        (anchor.target && anchor.target !== '_self')
      ) {
        return;
      }

      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin) return;
      const normalizedBasePath = normalizeCatalogBasePath(currentBinding.basePath);
      const belongsToCatalog = normalizedBasePath
        ? (
            destination.pathname === normalizedBasePath ||
            destination.pathname.startsWith(`${normalizedBasePath}/`)
          )
        : true;
      if (!belongsToCatalog) return;
      if (
        destination.pathname === window.location.pathname &&
        destination.search === window.location.search &&
        destination.hash
      ) {
        return;
      }

      event.preventDefault();
      anchor.closest<HTMLDialogElement>('dialog[open]')?.close();
      currentBinding.navigate(
        stripCatalogBasePath(destination.pathname, currentBinding.basePath),
      );
    });
  } else {
    binding.basePath = options.basePath;
    binding.navigate = options.navigate;
  }

  const sidebar = shell.querySelector<HTMLElement>('[data-catalog-sidebar]');
  if (!sidebar) return;
  for (const anchor of Array.from(sidebar.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
    const destination = new URL(anchor.href, window.location.href);
    const normalizedBasePath = normalizeCatalogBasePath(options.basePath);
    const belongsToCatalog = destination.origin === window.location.origin && (
      normalizedBasePath
        ? (
            destination.pathname === normalizedBasePath ||
            destination.pathname.startsWith(`${normalizedBasePath}/`)
          )
        : true
    );
    if (!belongsToCatalog) continue;
    const itemPath = stripCatalogBasePath(destination.pathname, options.basePath);
    if (catalogPathIsActive(options.currentPath, itemPath)) {
      anchor.setAttribute('aria-current', 'page');
    } else {
      anchor.removeAttribute('aria-current');
    }
  }
}

async function copyCatalogText(button: HTMLButtonElement, value: string): Promise<void> {
  if (!value) return;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.append(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    const previous = button.dataset.copyLabel ?? button.childNodes[0]?.textContent ?? button.textContent ?? 'Copy';
    button.dataset.copyLabel = previous;
    button.childNodes[0].textContent = 'Copied';
    button.dataset.copied = 'true';
    window.setTimeout(() => {
      if (!document.contains(button)) return;
      button.childNodes[0].textContent = button.dataset.copyLabel ?? 'Copy';
      delete button.dataset.copied;
    }, 1600);
  } catch {
    button.dataset.copyFailed = 'true';
    button.setAttribute('aria-label', 'Copy failed; select the code manually');
  }
}

function safeLocalStorageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Theme persistence is optional when storage is unavailable.
  }
}

function applyCatalogTheme(shell: HTMLElement, theme: string): void {
  const accepted = ['light', 'dark', 'high-contrast-light', 'high-contrast-dark'];
  const next = accepted.includes(theme) ? theme : 'light';
  shell.dataset.uifnTheme = next;
  for (const [name, value] of Object.entries(catalogThemeStyle(next))) {
    shell.style.setProperty(name, value);
  }
  document.documentElement.dataset.uifnTheme = next;
  const button = shell.querySelector<HTMLButtonElement>('[data-catalog-theme-toggle]');
  const icon = button?.querySelector<HTMLElement>('[data-catalog-theme-icon]');
  if (button) button.setAttribute('aria-label', `Switch to ${next === 'dark' ? 'light' : 'dark'} theme`);
  if (icon) icon.textContent = next === 'dark' ? '☀' : '☾';
  const themeColor = next.includes('dark') ? '#111827' : '#f7f8fb';
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.append(meta);
  }
  meta.content = themeColor;
}

function setCatalogMeta(attribute: 'name' | 'property', key: string, content: string): void {
  let meta = document.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute(attribute, key);
    document.head.append(meta);
  }
  meta.content = content;
}

function catalogCodeSnippet(slug: ComponentSlug, framework: CatalogFramework): string {
  if (
    slug === 'breadcrumb'
    || slug === 'button'
    || slug === 'card'
    || slug === 'dialog'
    || slug === 'input-group'
    || slug === 'pagination'
    || slug === 'table'
  ) {
    return catalogStructuredComponentCodeSnippet(slug, framework);
  }
  if (slug === 'form') return catalogFormCodeSnippet(framework);
  if (slug === 'field') return catalogFieldCodeSnippet(framework);
  if (slug === 'fieldset') return catalogFieldsetCodeSnippet(framework);
  if (slug === 'navigation-menu') return catalogNavigationMenuCodeSnippet(framework);
  if (slug === 'tree-view') return catalogTreeViewCodeSnippet(framework);
  const demo = getCatalogComponentDemo(slug);
  const exports = [
    demo.root.exportName,
    ...demo.parts.map((part) => part.exportName),
  ].filter((name, index, values) => values.indexOf(name) === index);
  const packageName = `@uifn/components-${framework}/${slug}`;
  const importBlock = exports.length <= 4
    ? `import { ${exports.join(', ')} } from '${packageName}'`
    : `import {\n${exports.map((name) => `  ${name},`).join('\n')}\n} from '${packageName}'`;
  const markup = catalogSnippetRoot(slug, demo);

  if (framework === 'svelte') {
    const svelteImports = importBlock
      .split('\n')
      .map((line) => `  ${line}`)
      .join('\n');
    return `<script lang="ts">\n${svelteImports}\n  import '@uifn/components/styles.css'\n</script>\n\n${markup}`;
  }
  if (framework === 'react' || framework === 'solid') {
    return `${importBlock}\nimport '@uifn/components/styles.css'\n\nexport function Example() {\n  return (\n${indentCode(markup, 4)}\n  )\n}`;
  }
  throw new Error(`Unsupported catalog framework: ${String(framework)}`);
}

function catalogStructuredComponentCodeSnippet(
  slug: 'breadcrumb' | 'button' | 'card' | 'dialog' | 'input-group' | 'pagination' | 'table',
  framework: CatalogFramework,
): string {
  const definitions = {
    breadcrumb: {
      exports: [
        'BreadcrumbRoot',
        'BreadcrumbList',
        'BreadcrumbItem',
        'BreadcrumbLink',
        'BreadcrumbPage',
        'BreadcrumbSeparator',
        'BreadcrumbEllipsis',
      ],
      markup: `<BreadcrumbRoot>
  <BreadcrumbList>
    <BreadcrumbItem value="workspace">
      <BreadcrumbLink value="workspace" href="/workspace">Workspace</BreadcrumbLink>
    </BreadcrumbItem>
    <BreadcrumbSeparator value="workspace-projects" />
    <BreadcrumbItem value="collapsed">
      <BreadcrumbEllipsis />
    </BreadcrumbItem>
    <BreadcrumbSeparator value="collapsed-projects" />
    <BreadcrumbItem value="projects">
      <BreadcrumbLink value="projects" href="/workspace/projects">Projects</BreadcrumbLink>
    </BreadcrumbItem>
    <BreadcrumbSeparator value="projects-settings" />
    <BreadcrumbItem value="settings"><BreadcrumbPage>Settings</BreadcrumbPage></BreadcrumbItem>
  </BreadcrumbList>
</BreadcrumbRoot>`,
    },
    button: {
      exports: [
        'ButtonRoot',
        'ButtonIcon',
        'ButtonLabel',
        'ButtonSpinner',
      ],
      markup: `<ButtonRoot variant="primary">
  <ButtonIcon aria-hidden="true">✓</ButtonIcon>
  <ButtonLabel>Save changes</ButtonLabel>
  <ButtonSpinner aria-hidden="true">Saving</ButtonSpinner>
</ButtonRoot>`,
    },
    card: {
      exports: [
        'CardRoot',
        'CardHeader',
        'CardTitle',
        'CardDescription',
        'CardAction',
        'CardContent',
        'CardFooter',
      ],
      markup: `<CardRoot elevated>
  <CardHeader>
    <CardTitle>Release health</CardTitle>
    <CardDescription>Production deployment status for Acme Cloud.</CardDescription>
    <CardAction><button type="button">View releases</button></CardAction>
  </CardHeader>
  <CardContent>
    <strong>All systems operational</strong>
    <p>12 checks passed across 3 regions.</p>
  </CardContent>
  <CardFooter>Deployed 8 minutes ago by Alex Morgan</CardFooter>
</CardRoot>`,
    },
    dialog: {
      exports: [
        'DialogRoot',
        'DialogTrigger',
        'DialogPortal',
        'DialogBackdrop',
        'DialogPositioner',
        'DialogContent',
        'DialogTitle',
        'DialogDescription',
        'DialogClose',
      ],
      markup: `<DialogRoot>
  <DialogTrigger type="button">Edit profile</DialogTrigger>
  <DialogPortal>
    <DialogBackdrop />
    <DialogPositioner>
      <DialogContent>
        <DialogTitle>Edit profile</DialogTitle>
        <DialogDescription>Update the details teammates see across your workspace.</DialogDescription>
        <label>Display name <input name="displayName" ${framework === 'react' ? 'defaultValue' : 'value'}="Alex Morgan" /></label>
        <DialogClose type="button">Done</DialogClose>
      </DialogContent>
    </DialogPositioner>
  </DialogPortal>
</DialogRoot>`,
    },
    'input-group': {
      exports: [
        'InputGroupRoot',
        'InputGroupAddon',
        'InputGroupText',
        'InputGroupControl',
        'InputGroupInput',
        'InputGroupTextarea',
        'InputGroupButton',
      ],
      markup: `<InputGroupRoot>
  <InputGroupAddon value="protocol">
    <InputGroupText value="protocol">https://</InputGroupText>
  </InputGroupAddon>
  <InputGroupControl>
    <InputGroupInput aria-label="Project domain" placeholder="project-name" />
  </InputGroupControl>
  <InputGroupAddon value="copy">
    <InputGroupButton value="copy" type="button">Copy</InputGroupButton>
  </InputGroupAddon>
</InputGroupRoot>`,
    },
    pagination: {
      exports: [
        'PaginationRoot',
        'PaginationList',
        'PaginationItem',
        'PaginationPageTrigger',
        'PaginationPrevious',
        'PaginationNext',
        'PaginationEllipsis',
      ],
      markup: `<PaginationRoot count={120} pageSize={12} defaultPage={2} aria-label="Results pages">
  <PaginationList>
    <li><PaginationPrevious type="button">Previous</PaginationPrevious></li>
    <PaginationItem value={1}><PaginationPageTrigger type="button" value={1}>1</PaginationPageTrigger></PaginationItem>
    <PaginationItem value={2}><PaginationPageTrigger type="button" value={2}>2</PaginationPageTrigger></PaginationItem>
    <PaginationItem value={3}><PaginationPageTrigger type="button" value={3}>3</PaginationPageTrigger></PaginationItem>
    <PaginationEllipsis value="start">…</PaginationEllipsis>
    <PaginationItem value={10}><PaginationPageTrigger type="button" value={10}>10</PaginationPageTrigger></PaginationItem>
    <li><PaginationNext type="button">Next</PaginationNext></li>
  </PaginationList>
</PaginationRoot>`,
    },
    table: {
      exports: [
        'TableRoot',
        'TableTable',
        'TableCaption',
        'TableHeader',
        'TableBody',
        'TableFooter',
        'TableRow',
        'TableHead',
        'TableCell',
      ],
      markup: `<TableRoot striped>
  <TableTable>
    <TableCaption>Production environments and their current release health.</TableCaption>
    <TableHeader>
      <TableRow value="header">
        <TableHead value="environment">Environment</TableHead>
        <TableHead value="release">Release</TableHead>
        <TableHead value="status">Status</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow value="production">
        <TableCell value="production-environment">Production</TableCell>
        <TableCell value="production-release">v2.8.0</TableCell>
        <TableCell value="production-status">Healthy</TableCell>
      </TableRow>
      <TableRow value="preview">
        <TableCell value="preview-environment">Preview</TableCell>
        <TableCell value="preview-release">PR #482</TableCell>
        <TableCell value="preview-status">Building</TableCell>
      </TableRow>
    </TableBody>
    <TableFooter>
      <TableRow value="summary">
        <TableCell value="summary" ${framework === 'svelte' ? 'colspan' : 'colSpan'}={3}>2 environments · last checked just now</TableCell>
      </TableRow>
    </TableFooter>
  </TableTable>
</TableRoot>`,
    },
  } as const;
  const definition = definitions[slug];
  const packageName = `@uifn/components-${framework}/${slug}`;
  const importBlock = `import {\n${definition.exports.map((name) => `  ${name},`).join('\n')}\n} from '${packageName}'`;
  if (framework === 'svelte') {
    return `<script lang="ts">
${importBlock.split('\n').map((line) => `  ${line}`).join('\n')}
  import '@uifn/components/styles.css'
</script>

${definition.markup}`;
  }
  return `${importBlock}
import '@uifn/components/styles.css'

export function Example() {
  return (
${indentCode(definition.markup, 4)}
  )
}`;
}

function catalogTreeViewCodeSnippet(framework: CatalogFramework): string {
  const packageName = `@uifn/components-${framework}/tree-view`;
  const exports = [
    'TreeViewRoot',
    'TreeViewLabel',
    'TreeViewTree',
    'TreeViewItem',
    'TreeViewItemTrigger',
    'TreeViewItemText',
    'TreeViewBranch',
    'TreeViewIndicator',
  ];
  const importBlock = `import {\n${exports.map((name) => `  ${name},`).join('\n')}\n} from '${packageName}'`;
  const markup = `<TreeViewRoot items={[{ id: 'workspace', textValue: 'Workspace', children: [{ id: 'projects', textValue: 'Projects' }] }]}>
  <TreeViewLabel>Project files</TreeViewLabel>
  <TreeViewTree>
    <TreeViewItem value="workspace">
      <TreeViewItemTrigger type="button" value="workspace" aria-label="Toggle Workspace">›</TreeViewItemTrigger>
      <TreeViewItemText value="workspace">Workspace</TreeViewItemText>
      <TreeViewBranch value="workspace">
        <TreeViewItem value="projects">
          <TreeViewItemTrigger type="button" value="projects" aria-label="Projects">›</TreeViewItemTrigger>
          <TreeViewItemText value="projects">Projects</TreeViewItemText>
          <TreeViewBranch value="projects" />
          <TreeViewIndicator value="projects">⌄</TreeViewIndicator>
        </TreeViewItem>
      </TreeViewBranch>
      <TreeViewIndicator value="workspace">⌄</TreeViewIndicator>
    </TreeViewItem>
  </TreeViewTree>
</TreeViewRoot>`;

  if (framework === 'svelte') {
    return `<script lang="ts">
${importBlock.split('\n').map((line) => `  ${line}`).join('\n')}
  import '@uifn/components/styles.css'
</script>

${markup}`;
  }
  return `${importBlock}
import '@uifn/components/styles.css'

export function Example() {
  return (
${indentCode(markup, 4)}
  )
}`;
}

function catalogFormCodeSnippet(framework: CatalogFramework): string {
  const packageName = `@uifn/components-${framework}/form`;
  const imports = `import { FormRoot, FormErrorSummary, FormActions } from '${packageName}'`;
  const formMarkup = (inputValue: string, labelFor: string, className: string) => `<FormRoot>
  <div ${className}="form-field">
    <label ${labelFor}="workspace-name">Workspace name</label>
    <input
      id="workspace-name"
      name="workspaceName"
      ${inputValue}
      autocomplete="organization"
      required
    />
    <span>Used in navigation, invitations, and shared links.</span>
  </div>
  <FormErrorSummary />
  <FormActions>
    <button type="button">Cancel</button>
    <button type="submit">Save workspace</button>
  </FormActions>
</FormRoot>`;

  if (framework === 'svelte') {
    return `<script lang="ts">
  ${imports}
  import '@uifn/components/styles.css'
</script>

${formMarkup('value="Acme Design"', 'for', 'class')}`;
  }
  const valueProp = framework === 'react'
    ? 'defaultValue="Acme Design"'
    : 'value="Acme Design"';
  return `${imports}
import '@uifn/components/styles.css'

export function Example() {
  return (
${indentCode(formMarkup(
    valueProp,
    framework === 'react' ? 'htmlFor' : 'for',
    framework === 'react' ? 'className' : 'class',
  ), 4)}
  )
}`;
}

function catalogFieldCodeSnippet(framework: CatalogFramework): string {
  const packageName = `@uifn/components-${framework}/field`;
  const imports = `import { FieldRoot, FieldLabel, FieldControl, FieldDescription, FieldError, FieldRequiredIndicator } from '${packageName}'`;
  const labelFor = framework === 'react' ? 'htmlFor' : 'for';
  const autoComplete = framework === 'react' ? 'autoComplete' : 'autocomplete';
  const markup = `<FieldRoot required>
  <FieldLabel ${labelFor}="work-email">
    Work email <FieldRequiredIndicator>*</FieldRequiredIndicator>
  </FieldLabel>
  <FieldControl>
    <input
      id="work-email"
      name="email"
      type="email"
      placeholder="you@company.com"
      ${autoComplete}="email"
      aria-describedby="work-email-description"
      required
    />
  </FieldControl>
  <FieldDescription id="work-email-description">
    We will only use this for account notifications.
  </FieldDescription>
  <FieldError />
</FieldRoot>`;

  if (framework === 'svelte') {
    return `<script lang="ts">
  ${imports}
  import '@uifn/components/styles.css'
</script>

${markup}`;
  }
  return `${imports}
import '@uifn/components/styles.css'

export function Example() {
  return (
${indentCode(markup, 4)}
  )
}`;
}

function catalogFieldsetCodeSnippet(framework: CatalogFramework): string {
  const packageName = `@uifn/components-${framework}/fieldset`;
  const imports = `import { FieldsetRoot, FieldsetLegend, FieldsetContent, FieldsetDescription, FieldsetError } from '${packageName}'`;
  const firstChecked = framework === 'react' ? 'defaultChecked' : 'checked';
  const markup = `<FieldsetRoot>
  <FieldsetLegend>Workspace notifications</FieldsetLegend>
  <FieldsetDescription>Choose which updates your team should receive.</FieldsetDescription>
  <FieldsetContent>
    <label><input type="checkbox" ${firstChecked} /> Product updates</label>
    <label><input type="checkbox" /> Security alerts</label>
  </FieldsetContent>
  <FieldsetError />
</FieldsetRoot>`;

  if (framework === 'svelte') {
    return `<script lang="ts">
  ${imports}
  import '@uifn/components/styles.css'
</script>

${markup}`;
  }
  return `${imports}
import '@uifn/components/styles.css'

export function Example() {
  return (
${indentCode(markup, 4)}
  )
}`;
}

function catalogNavigationMenuCodeSnippet(framework: CatalogFramework): string {
  const packageName = `@uifn/components-${framework}/navigation-menu`;
  const imports = `import {
  NavigationMenuRoot,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuTrigger,
  NavigationMenuContent,
  NavigationMenuLink,
  NavigationMenuViewport,
  NavigationMenuIndicator,
} from '${packageName}'`;
  const markup = `<NavigationMenuRoot items={[
  { id: 'products', textValue: 'Products', hasContent: true },
  { id: 'resources', textValue: 'Resources', hasContent: true },
  { id: 'company', textValue: 'Company', hasContent: true },
]}>
  <NavigationMenuList>
    <NavigationMenuItem value="products">
      <NavigationMenuTrigger type="button" value="products">Products</NavigationMenuTrigger>
      <NavigationMenuContent value="products">
        <NavigationMenuLink value="products" href="#products">Product overview</NavigationMenuLink>
      </NavigationMenuContent>
    </NavigationMenuItem>
    <NavigationMenuItem value="resources">
      <NavigationMenuTrigger type="button" value="resources">Resources</NavigationMenuTrigger>
      <NavigationMenuContent value="resources">
        <NavigationMenuLink value="resources" href="#documentation">Documentation</NavigationMenuLink>
      </NavigationMenuContent>
    </NavigationMenuItem>
    <NavigationMenuItem value="company">
      <NavigationMenuTrigger type="button" value="company">Company</NavigationMenuTrigger>
      <NavigationMenuContent value="company">
        <NavigationMenuLink value="company" href="#company">About uifn</NavigationMenuLink>
      </NavigationMenuContent>
    </NavigationMenuItem>
  </NavigationMenuList>
  <NavigationMenuViewport />
  <NavigationMenuIndicator />
</NavigationMenuRoot>`;

  if (framework === 'svelte') {
    return `<script lang="ts">
${imports.split('\n').map((line) => `  ${line}`).join('\n')}
  import '@uifn/components/styles.css'
</script>

${markup}`;
  }
  return `${imports}
import '@uifn/components/styles.css'

export function Example() {
  return (
${indentCode(markup, 4)}
  )
}`;
}

function catalogSnippetRoot(slug: ComponentSlug, demo: CatalogComponentDemo): string {
  const props = catalogSnippetProps(catalogDemoSnippetRootProps(slug));
  if (demo.root.voidElement) return `<${demo.root.exportName}${props} />`;
  const childLines = catalogDemoChildren(demo, demo.root.id)
    .flatMap((part) => catalogSnippetPartInstances(slug, demo, part, 0));
  if (!childLines.length) {
    if (demo.root.element === 'div') return `<${demo.root.exportName}${props} />`;
    const rootText = catalogDemoRootText(slug);
    return rootText
      ? `<${demo.root.exportName}${props}>${catalogSnippetText(rootText)}</${demo.root.exportName}>`
      : `<${demo.root.exportName}${props} />`;
  }
  return [
    `<${demo.root.exportName}${props}>`,
    ...childLines.map((line) => indentCode(line, 2)),
    `</${demo.root.exportName}>`,
  ].join('\n');
}

function catalogSnippetPartInstances(
  slug: ComponentSlug,
  demo: CatalogComponentDemo,
  part: CatalogDemoPart,
  inheritedIndex: number,
): string[] {
  return catalogDemoPartInstances(part).map((ownIndex) => {
    const instanceIndex = part.repeat > 1 ? ownIndex : inheritedIndex;
    return catalogSnippetPart(slug, demo, part, instanceIndex);
  });
}

function catalogSnippetPart(
  slug: ComponentSlug,
  demo: CatalogComponentDemo,
  part: CatalogDemoPart,
  instanceIndex: number,
): string {
  const props = catalogSnippetProps(catalogDemoPartProps(slug, part, instanceIndex));
  if (part.voidElement || (slug === 'select' && part.id === 'valueText') || (slug === 'qr-code' && part.id === 'image')) {
    return `<${part.exportName}${props} />`;
  }
  const descendants = catalogDemoChildren(demo, part.id);
  const regularDescendants = descendants.filter((child) => child.element !== 'td');
  const cellDescendants = descendants.filter((child) => child.element === 'td');
  const children: string[] = [];
  const text = catalogDemoPartText(slug, part, instanceIndex);
  if (text) children.push(catalogSnippetText(text));
  children.push(...regularDescendants.flatMap((child) => (
    catalogSnippetPartInstances(slug, demo, child, instanceIndex)
  )));
  if (cellDescendants.length) {
    const cells = cellDescendants.flatMap((child) => (
      catalogSnippetPartInstances(slug, demo, child, instanceIndex)
    ));
    children.push(`<tbody>\n  <tr>\n${cells.map((cell) => indentCode(cell, 4)).join('\n')}\n  </tr>\n</tbody>`);
  }
  if (!children.length) return `<${part.exportName}${props} />`;
  if (children.length === 1 && !children[0].includes('\n') && !children[0].startsWith('<')) {
    return `<${part.exportName}${props}>${children[0]}</${part.exportName}>`;
  }
  return [
    `<${part.exportName}${props}>`,
    ...children.map((child) => indentCode(child, 2)),
    `</${part.exportName}>`,
  ].join('\n');
}

function catalogSnippetProps(props: Readonly<Record<string, unknown>>): string {
  return Object.entries(props)
    .map(([name, value]) => {
      if (value === undefined) return '';
      if (value === true) return ` ${name}`;
      if (typeof value === 'string') return ` ${name}=${JSON.stringify(value)}`;
      return ` ${name}={${JSON.stringify(value)}}`;
    })
    .join('');
}

function catalogSnippetText(value: string): string {
  return /[<>{}\n]/.test(value) ? `{${JSON.stringify(value)}}` : value;
}

function indentCode(value: string, spaces: number): string {
  const prefix = ' '.repeat(spaces);
  return value.split('\n').map((line) => `${prefix}${line}`).join('\n');
}

function humanize(value: string): string {
  return value
    .split('-')
    .map((part) => part === 'otp' ? 'OTP' : part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function groupedComponents(): Array<[string, typeof workbenchComponents]> {
  const groups = new Map<string, typeof workbenchComponents>();
  for (const component of workbenchComponents) {
    const category = presentationCategory(component.slug);
    const group = groups.get(category) ?? [];
    group.push(component);
    groups.set(category, group);
  }
  const order = ['Actions and controls', 'Forms and input', 'Selection', 'Navigation', 'Overlays', 'Feedback and status', 'Layout and display'];
  return [...groups.entries()]
    .sort(([left], [right]) => order.indexOf(left) - order.indexOf(right) || left.localeCompare(right))
    .map(([category, components]) => [
      category,
      [...components].sort((left, right) => left.displayName.localeCompare(right.displayName)),
    ]);
}

function presentationCategory(slug: string): string {
  const forms = new Set([
    'color-picker',
    'date-input',
    'date-picker',
    'editable',
    'field',
    'fieldset',
    'file-upload',
    'form',
    'input',
    'number-input',
    'password-input',
    'pin-input',
    'signature-pad',
  ]);
  const selection = new Set([
    'autocomplete',
    'checkbox',
    'checkbox-group',
    'combobox',
    'listbox',
    'radio-group',
    'rating-group',
    'segment-group',
    'select',
    'switch',
    'tags-input',
    'toggle',
    'toggle-group',
    'tree-view',
  ]);
  const navigation = new Set([
    'accordion',
    'carousel',
    'collapsible',
    'context-menu',
    'menu',
    'menubar',
    'navigation-menu',
    'pagination',
    'steps',
    'tabs',
    'toolbar',
  ]);
  const overlays = new Set([
    'alert-dialog',
    'dialog',
    'drawer',
    'floating-panel',
    'hover-card',
    'popover',
    'tooltip',
    'tour',
  ]);
  const feedback = new Set(['clipboard', 'meter', 'progress', 'timer', 'toast']);
  const display = new Set(['avatar', 'marquee', 'qr-code', 'scroll-area', 'separator']);
  if (forms.has(slug)) return 'Forms and input';
  if (selection.has(slug)) return 'Selection';
  if (navigation.has(slug)) return 'Navigation';
  if (overlays.has(slug)) return 'Overlays';
  if (feedback.has(slug)) return 'Feedback and status';
  if (display.has(slug)) return 'Layout and display';
  return 'Actions and controls';
}

function catalogPathIsActive(currentPath: string, itemPath: string): boolean {
  if (itemPath === '/components') return currentPath === '/' || currentPath === '/components';
  return currentPath === itemPath || currentPath.startsWith(`${itemPath}/`);
}

function normalizedCategory(category: string): string {
  if (category.startsWith('Data')) return 'Data';
  if (category.startsWith('Feedback')) return 'Feedback';
  if (category.startsWith('Navigation')) return 'Navigation';
  if (category.startsWith('Overlay')) return 'Overlays';
  if (category === 'Action') return 'Actions';
  if (category === 'Form') return 'Forms';
  return category;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
