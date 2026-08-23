import type { PatternName, PatternStatus } from '@uifn/patterns';
import { workbenchComponents, type ComponentSlug } from './component-inventory.js';
import { workbenchPatterns } from './pattern-inventory.js';
import type { WorkbenchScenarioDefinition } from './scenario-inventory.js';
import { workbenchSfPanels } from './sf-inventory.js';
import type { WorkbenchRoute } from './routes.js';
import { getWorkbenchRoute } from './routes.js';
import { workbenchSfStates } from './qa-contract.js';

export interface WorkbenchRenderTarget {
  family: 'component' | 'pattern' | 'sf' | 'index' | 'qa';
  slug?: string;
  status?: PatternStatus;
  state?: string;
}

export const workbenchStatusData = {
  loading: undefined,
  empty: [],
  error: undefined,
  partial: [{ id: 'partial-demo', label: 'Partial demo item' }],
  'permission-denied': undefined,
  optimistic: [{ id: 'optimistic-demo', label: 'Optimistic demo item' }],
  success: [
    { id: 'success-demo-1', label: 'Success demo item 1' },
    { id: 'success-demo-2', label: 'Success demo item 2' },
    { id: 'success-demo-3', label: 'Success demo item 3' },
  ],
  'degraded-network': [{ id: 'degraded-demo', label: 'Degraded network demo item' }],
  'unsupported-capability': undefined,
} as const satisfies Record<PatternStatus, unknown>;

const patternSuccessData: Record<PatternName, unknown> = {
  AuthPanel: { user: { id: 'user-demo', name: 'Demo User' }, providers: [{ id: 'github', label: 'GitHub', connected: true }, { id: 'google', label: 'Google', connected: false }] },
  ApiKeyTable: [
    { id: 'key-1', name: 'Production', prefix: 'uifn_prod', createdAt: '2026-06-01', lastUsedAt: '2026-06-27' },
    { id: 'key-2', name: 'Development', prefix: 'uifn_dev', createdAt: '2026-06-10', lastUsedAt: null },
    { id: 'key-3', name: 'Automation', prefix: 'uifn_auto', createdAt: '2026-06-20', lastUsedAt: '2026-06-28' },
  ],
  SessionList: [
    { id: 'session-1', device: 'Chrome on macOS', location: 'Demo region', current: true, lastActiveAt: '2026-06-28T12:00:00Z' },
    { id: 'session-2', device: 'Safari on iOS', location: 'Demo region', current: false, lastActiveAt: '2026-06-27T08:30:00Z' },
  ],
  UserProfileCard: { id: 'user-demo', name: 'Demo User', email: 'redacted@example.invalid', avatarUrl: null },
  ProviderPicker: [
    { id: 'github', label: 'GitHub', connected: true },
    { id: 'slack', label: 'Slack', connected: false },
    { id: 'linear', label: 'Linear', connected: false },
  ],
  OAuthConnectionsPanel: [
    { id: 'conn-1', providerId: 'github', accountLabel: 'demo-org', status: 'connected' },
    { id: 'conn-2', providerId: 'slack', accountLabel: 'demo-workspace', status: 'expired' },
  ],
  WebhookEndpointTable: [
    { id: 'webhook-1', url: 'https://example.invalid/hooks/one', events: ['connection.created'], enabled: true },
    { id: 'webhook-2', url: 'https://example.invalid/hooks/two', events: ['connection.deleted'], enabled: false },
  ],
  FileDropzonePanel: [
    { id: 'file-1', name: 'roadmap.pdf', size: 1200, status: 'uploaded' },
    { id: 'file-2', name: 'design.png', size: 2400, status: 'queued' },
  ],
  UploadProgressList: [
    { id: 'upload-1', name: 'roadmap.pdf', progress: 64, status: 'uploading' },
    { id: 'upload-2', name: 'design.png', progress: 100, status: 'complete' },
  ],
  FileListPanel: [
    { id: 'file-1', name: 'roadmap.pdf', size: 1200, status: 'uploaded' },
    { id: 'file-2', name: 'design.png', size: 2400, status: 'uploaded' },
  ],
  QuotaUsagePanel: { label: 'Demo storage', used: 512, limit: 1024, unit: 'MB' },
  BillingPlanCards: [
    { id: 'starter', name: 'Starter', price: '$0', current: true, features: ['1 workspace'] },
    { id: 'pro', name: 'Pro', price: '$20', current: false, features: ['Unlimited workspaces'] },
  ],
  SubscriptionStatusPanel: { planName: 'Starter', status: 'active', renewalDate: '2026-07-27' },
  InvoiceTable: [
    { id: 'invoice-1', number: 'INV-DEMO-001', amount: '$0.00', status: 'paid', issuedAt: '2026-06-01' },
    { id: 'invoice-2', number: 'INV-DEMO-002', amount: '$20.00', status: 'open', issuedAt: '2026-07-01' },
  ],
};

export function toComponentExportName(slug: string): string {
  if (slug === 'input-otp') return 'InputOTP';
  if (slug === 'data-table') return 'DataTable';
  if (slug === 'date-picker') return 'DatePicker';
  return slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

export function getComponentBySlug(slug: string) {
  return workbenchComponents.find((component) => component.slug === slug);
}

export function getPatternBySlug(slug: string) {
  return workbenchPatterns.find((pattern) => pattern.slug === slug);
}

export function getSfPanelBySlug(slug: string) {
  return workbenchSfPanels.find((panel) => panel.slug === slug);
}

export function parseWorkbenchPath(pathname: string): WorkbenchRoute {
  return getWorkbenchRoute(pathname || '/');
}

export function getStatusFromRoute(route: WorkbenchRoute): PatternStatus {
  if (route.fixtureId && (workbenchSfStates as readonly string[]).includes(route.fixtureId)) {
    return route.fixtureId as PatternStatus;
  }
  return 'success';
}

export function componentPropsForSlug(slug: ComponentSlug, route: WorkbenchRoute): Record<string, unknown> {
  const open = route.fixtureId === 'open';
  const state = route.fixtureId ?? 'default';
  const slugId: string = slug;
  const common = {
    'aria-label': `${slug} ${state} Workbench fixture`,
    className: `workbench-uifn-root workbench-${slug}`,
    variant: 'primary',
    size: 'md',
    surface: 'raised',
    surfaceDepth: 1,
    loading: state === 'loading',
    disabled: state === 'disabled',
    invalid: state === 'invalid',
    active: state === 'active',
    selected: state === 'selected',
    open: undefined,
    defaultOpen: open,
    defaultChecked: true,
    checked: slug === 'checkbox' || slug === 'switch' || slug === 'toggle' ? true : undefined,
    defaultValue: ['input', 'date-input', 'number-input', 'password-input'].includes(slugId)
      ? 'uifn-demo-value'
      : slug === 'tabs'
        ? 'overview'
        : slug === 'toggle-group'
          ? 'left'
          : slug === 'menubar'
            ? 'file'
            : slug === 'pagination'
              ? '2'
              : slug === 'slider'
                ? '64'
                : 'alpha',
    value: undefined,
    placeholder: 'uifn demo value',
    items: [
      { value: 'alpha', label: 'Alpha' },
      { value: 'beta', label: 'Beta' },
      { value: 'gamma', label: 'Gamma', disabled: true },
    ],
  };

  if (slugId === 'tree-view') {
    return {
      ...common,
      items: Array.from({ length: state === 'large-data' ? 250 : 8 }, (_, index) => ({
        value: `node-${index + 1}`,
        label: `Node ${index + 1}`,
      })),
    };
  }

  if (slugId === 'date-input' || slugId === 'date-picker') {
    return {
      ...common,
      value: '2026-06-10',
      min: '2026-06-01',
      max: '2026-06-30',
      locale: 'en-US',
      timeZone: 'UTC',
      disabledDates: ['2026-06-15'],
    };
  }

  if (slugId === 'autocomplete' || slugId === 'combobox') {
    return {
      ...common,
      items: state === 'empty' ? [] : [
        { id: 'deploy', label: 'Deploy Project' },
        { id: 'archive', label: 'Archive Project' },
        { id: 'delete', label: 'Delete Project', disabled: true },
      ],
    };
  }

  if (slugId === 'splitter') {
    return {
      ...common,
      sizes: [50, 50],
      orientation: 'horizontal',
      nested: state === 'large-data',
    };
  }

  return common;
}

export function patternProps(name: PatternName, status: PatternStatus, onAction?: (callback: string) => void): Record<string, unknown> {
  const successData = patternSuccessData[name];
  const data = status === 'success'
    ? successData
    : status === 'empty'
      ? []
      : status === 'partial' || status === 'degraded-network'
        ? Array.isArray(successData) ? successData.slice(0, 1) : successData
        : status === 'optimistic'
          ? Array.isArray(successData) ? [...successData, { id: 'optimistic-item', label: 'Pending item', pending: true }] : successData
          : undefined;
  const callback = (name: string) => () => onAction?.(name);
  const base = {
    status,
    data,
    error: status === 'error' ? { code: 'UIFN_WORKBENCH_ERROR', message: 'Workbench fixture error state.' } : null,
    disabled: status === 'permission-denied',
    onSignIn: callback('onSignIn'),
    onSignOut: callback('onSignOut'),
    onSwitchAccount: callback('onSwitchAccount'),
    onCreate: callback('onCreate'),
    onRevoke: callback('onRevoke'),
    onUpdate: callback('onUpdate'),
    onSelect: callback('onSelect'),
    onConnect: callback('onConnect'),
    onDisconnect: callback('onDisconnect'),
    onRotateSecret: callback('onRotateSecret'),
    onDelete: callback('onDelete'),
    onDrop: callback('onDrop'),
    onUpload: callback('onUpload'),
    onRemove: callback('onRemove'),
    onCancel: callback('onCancel'),
    onOpen: callback('onOpen'),
    onUpgrade: callback('onUpgrade'),
    onSelectPlan: callback('onSelectPlan'),
    onManage: callback('onManage'),
    onDownload: callback('onDownload'),
  };

  return {
    ...base,
    keys: data,
    sessions: data,
    providers: data,
    connections: data,
    endpoints: data,
    files: data,
    uploads: data,
    plans: data,
    invoices: data,
  };
}

export function patternModelHtml(input: {
  family: 'pattern' | 'sf';
  slug: string;
  name: string;
  status: PatternStatus;
  itemCount: number;
  callbacks: string[];
  data?: unknown;
  backendImports?: string[];
  metadata?: Record<string, unknown>;
}): string {
  const attrs = input.family === 'sf'
    ? `data-uifn-sf="${input.slug}"`
    : `data-uifn-pattern="${input.slug}"`;
  const metadata = input.metadata
    ? `<dl class="workbench-model-metadata" hidden aria-hidden="true">${Object.entries(input.metadata).map(([key, value]) => `<dt>${key}</dt><dd>${String(value)}</dd>`).join('')}</dl>`
    : '';
  const metadataAttrs = input.metadata
    ? Object.entries(input.metadata).map(([key, value]) => `data-uifn-meta-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}="${escapeHtml(String(value))}"`).join(' ')
    : '';
  const callbackList = input.callbacks.map((callback) => escapeHtml(callback)).join(',');
  const productData = renderProductData(input.data);
  const visibleCallbacks = visibleCallbacksForModel(input.name, input.callbacks);
  const actionButtons = visibleCallbacks.map((callback, index) => `
    <button
      type="button"
      data-uifn-action="${index === 0 ? 'primary' : 'secondary'}"
      data-uifn-callback="${escapeHtml(callback)}"
    >${escapeHtml(humanizeCallback(callback))}</button>
  `).join('');
  const statusLabel = humanizeStatus(input.status);

  return `
    <article class="workbench-model-card" ${attrs} ${metadataAttrs} data-status="${input.status}" data-item-count="${input.itemCount}" data-backend-import-count="${input.backendImports?.length ?? 0}" data-callback-count="${input.callbacks.length}" data-callbacks="${callbackList}" tabindex="0">
      <header>
        <div>
          <p class="eyebrow">${input.family === 'sf' ? 'Superfunction UI' : 'Application pattern'}</p>
          <h2>${input.name}</h2>
        </div>
        <span class="workbench-status-pill" data-status="${input.status}">${statusLabel}</span>
      </header>
      <p class="workbench-status-message" data-uifn-status-message role="${input.status === 'error' ? 'alert' : 'status'}">${statusMessage(input.status)}</p>
      ${productData}
      ${metadata}
      <div class="workbench-model-actions" aria-label="${escapeHtml(input.name)} actions">
        ${actionButtons || '<button type="button" data-uifn-action="primary" data-uifn-callback="inspect">Inspect</button>'}
      </div>
      <output class="workbench-action-result" data-uifn-action-result aria-live="polite">idle</output>
    </article>
  `;
}

const preferredModelCallbacks: Record<string, string[]> = {
  AuthPanel: ['onSignIn', 'onSignOut', 'onSwitchAccount'],
  ApiKeyTable: ['onCreate', 'onRevoke'],
  SessionList: ['onRevoke'],
  UserProfileCard: ['onUpdate', 'onSignOut'],
  ProviderPicker: ['onSelect', 'onConnect'],
  OAuthConnectionsPanel: ['onConnect', 'onDisconnect'],
  WebhookEndpointTable: ['onCreate', 'onRotateSecret', 'onDelete'],
  FileDropzonePanel: ['onDrop', 'onUpload'],
  UploadProgressList: ['onCancel', 'onRemove'],
  FileListPanel: ['onOpen', 'onDelete'],
  QuotaUsagePanel: ['onUpgrade'],
  BillingPlanCards: ['onSelectPlan', 'onUpgrade'],
  SubscriptionStatusPanel: ['onManage'],
  InvoiceTable: ['onDownload'],
};

function visibleCallbacksForModel(name: string, callbacks: string[]): string[] {
  const preferred = preferredModelCallbacks[name] ?? callbacks.slice(0, 3);
  const visible = preferred.filter((callback) => callbacks.includes(callback));
  return visible.length > 0 ? visible : callbacks.slice(0, 3);
}

function humanizeCallback(callback: string): string {
  const label = callback.replace(/^on/, '');
  return humanizeKey(label || 'Run action');
}

function humanizeKey(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function humanizeStatus(status: PatternStatus): string {
  const labels: Record<PatternStatus, string> = {
    loading: 'Loading',
    empty: 'Empty',
    error: 'Needs attention',
    partial: 'Partially loaded',
    'permission-denied': 'Restricted',
    optimistic: 'Updating',
    success: 'Ready',
    'degraded-network': 'Offline mode',
    'unsupported-capability': 'Unavailable',
  };
  return labels[status];
}

function statusMessage(status: PatternStatus): string {
  const messages: Record<PatternStatus, string> = {
    loading: 'Fetching the latest data…',
    empty: 'Nothing to show yet. Use an action below to get started.',
    error: 'We could not load this data. Try again in a moment.',
    partial: 'Some data is available while the rest continues loading.',
    'permission-denied': 'You do not have permission to manage this resource.',
    optimistic: 'Your change is being applied.',
    success: 'Live example populated with representative product data.',
    'degraded-network': 'Showing locally available data while the connection recovers.',
    'unsupported-capability': 'This capability is unavailable in the current environment.',
  };
  return messages[status];
}

function renderProductData(data: unknown): string {
  if (Array.isArray(data)) {
    if (data.length === 0) return '<div class="workbench-empty-state" data-uifn-empty-state><strong>No items yet</strong><span>New items will appear here when they are available.</span></div>';
    const rows = data.slice(0, 8).map((item, index) => {
      const record: Record<string, unknown> = item && typeof item === 'object' ? item as Record<string, unknown> : { value: item };
      const label = record.name ?? record.label ?? record.number ?? record.device ?? record.accountLabel ?? record.id ?? `Item ${index + 1}`;
      const description = record.location ?? record.email ?? record.url ?? record.issuedAt ?? record.createdAt ?? record.lastActiveAt ?? record.providerId ?? '';
      const detail = record.status ?? record.prefix ?? record.price ?? record.amount ?? (record.current === true ? 'Current' : '');
      const progress = typeof record.progress === 'number' ? record.progress : undefined;
      return `
        <li data-uifn-product-item="${escapeHtml(String(record.id ?? index))}">
          <div class="workbench-product-copy">
            <strong>${escapeHtml(String(label))}</strong>
            ${description === '' ? '' : `<small>${escapeHtml(formatProductValue(description))}</small>`}
            ${progress === undefined ? '' : `<span class="workbench-progress" role="progressbar" aria-label="${progress}% complete" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.max(0, Math.min(100, progress))}"><i style="width:${Math.max(0, Math.min(100, progress))}%"></i></span>`}
          </div>
          ${detail === '' ? '' : `<span class="workbench-product-badge">${escapeHtml(formatProductValue(detail))}</span>`}
        </li>
      `;
    }).join('');
    return `<ul class="workbench-product-list" data-uifn-product-data>${rows}</ul>`;
  }
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    if (record.user && typeof record.user === 'object') return renderAuthProductData(record);
    const rows = Object.entries(record).slice(0, 8).map(([key, value]) => `
      <div class="workbench-product-detail">
        <dt>${escapeHtml(humanizeKey(key))}</dt>
        <dd>${renderProductValue(value)}</dd>
      </div>
    `).join('');
    return `<dl class="workbench-product-details" data-uifn-product-data>${rows}</dl>`;
  }
  return '<p data-uifn-product-state>No product data for this state.</p>';
}

function renderAuthProductData(record: Record<string, unknown>): string {
  const user = record.user as Record<string, unknown>;
  const providers = Array.isArray(record.providers) ? record.providers : [];
  const name = String(user.name ?? 'Account user');
  const initials = name.split(/\s+/).map((part) => part.charAt(0)).join('').slice(0, 2).toUpperCase();
  const providerItems = providers.map((provider, index) => {
    const item: Record<string, unknown> = provider && typeof provider === 'object'
      ? provider as Record<string, unknown>
      : { label: provider };
    const label = String(item.label ?? item.id ?? `Provider ${index + 1}`);
    return `<span class="workbench-provider-chip" data-uifn-product-item="${escapeHtml(String(item.id ?? index))}" data-connected="${item.connected === true}">${escapeHtml(label)}<i>${item.connected === true ? 'Connected' : 'Available'}</i></span>`;
  }).join('');
  return `
    <section class="workbench-account-summary" data-uifn-product-data>
      <div class="workbench-avatar" aria-hidden="true">${escapeHtml(initials)}</div>
      <div>
        <strong>${escapeHtml(name)}</strong>
        <span>Signed in and ready to manage this workspace</span>
      </div>
      <div class="workbench-provider-list" aria-label="Identity providers">${providerItems}</div>
    </section>
  `;
}

function renderProductValue(value: unknown): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return '<span class="workbench-muted-value">None</span>';
    return `<span class="workbench-value-list">${value.slice(0, 4).map((item) => `<i>${escapeHtml(formatProductValue(item))}</i>`).join('')}</span>`;
  }
  if (value && typeof value === 'object') {
    const summary = Object.values(value as Record<string, unknown>).filter((item) => typeof item !== 'object').slice(0, 2);
    return escapeHtml(summary.map(formatProductValue).join(' · ') || 'Configured');
  }
  return escapeHtml(formatProductValue(value));
}

function formatProductValue(value: unknown): string {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  if (value === null || value === undefined || value === '') return 'Not set';
  const text = String(value);
  if (
    /^https?:\/\//.test(text) ||
    text.includes('@') ||
    /^\$/.test(text) ||
    /^\d{4}-\d{2}-\d{2}/.test(text) ||
    /^[A-Z]{2,}[-_]/.test(text)
  ) return text;
  return humanizeKey(text);
}

export function comboboxProbeHtml(fixtureId = 'default'): string {
  const expanded = fixtureId !== 'disabled';
  return `
    <section
      class="workbench-combobox-probe"
      data-uifn-component="combobox"
      data-case="${escapeHtml(fixtureId)}"
      onfocusout="setTimeout(()=>{if(!this.contains(document.activeElement)){const input=this.querySelector('[role=combobox]');const list=this.querySelector('[data-uifn-combobox-content]');if(input)input.setAttribute('aria-expanded','false');if(list)list.hidden=true;}},0)"
    >
      <label for="uifn-combobox-${escapeHtml(fixtureId)}">Search fruit</label>
      <input
        id="uifn-combobox-${escapeHtml(fixtureId)}"
        role="combobox"
        aria-label="Search fruit"
        aria-expanded="${expanded ? 'true' : 'false'}"
        aria-controls="uifn-combobox-list-${escapeHtml(fixtureId)}"
        aria-autocomplete="list"
        value="ap"
        onclick="const list=this.closest('[data-uifn-component]')?.querySelector('[data-uifn-combobox-content]');this.setAttribute('aria-expanded','true');if(list)list.hidden=false;"
        onkeydown="if(event.key==='Escape'){const list=this.closest('[data-uifn-component]')?.querySelector('[data-uifn-combobox-content]');this.setAttribute('aria-expanded','false');if(list)list.hidden=true;this.focus({preventScroll:true});}"
      />
      <div
        id="uifn-combobox-list-${escapeHtml(fixtureId)}"
        role="listbox"
        data-uifn-combobox-content
        ${expanded ? '' : 'hidden'}
        onkeydown="if(event.key==='Escape'){const root=this.closest('[data-uifn-component]');const input=root?.querySelector('[role=combobox]');this.hidden=true;if(input){input.setAttribute('aria-expanded','false');input.focus({preventScroll:true});}}"
      >
        <div role="option" aria-selected="true">Apple</div>
        <div role="option">Apricot</div>
        <div role="option" aria-disabled="true">Avocado unavailable</div>
      </div>
      <button type="button" data-uifn-action="combobox">Choose Apple</button>
    </section>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function scenarioModelHtml(scenario: WorkbenchScenarioDefinition): string {
  const componentLinks = scenario.componentSlugs.map((slug) => `
    <a href="/components/${escapeHtml(slug)}/qa" data-uifn-component-use="${escapeHtml(slug)}" data-uifn-scenario-qa-link="${escapeHtml(slug)}">${escapeHtml(slug)}</a>
  `).join('');
  const patternLinks = scenario.patternSlugs.map((slug) => `
    <a href="/patterns/${escapeHtml(slug)}/qa" data-uifn-scenario-pattern="${escapeHtml(slug)}">${escapeHtml(slug)}</a>
  `).join('');
  const sfLinks = scenario.sfPanelSlugs.map((slug) => `
    <a href="/sf/${escapeHtml(slug)}/qa" data-uifn-scenario-sf="${escapeHtml(slug)}">${escapeHtml(slug)}</a>
  `).join('');

  const workflow = scenario.slug === 'settings-console'
    ? `
      <form data-uifn-scenario-workflow="settings" aria-label="Workspace settings">
        <label>Workspace name <input name="workspace" value="Demo workspace" data-uifn-component-use="input" /></label>
        <label>Notifications <input type="checkbox" name="notifications" checked data-uifn-component-use="switch" /></label>
        <label>Timezone <select name="timezone" data-uifn-component-use="select"><option>UTC</option><option>Asia/Kolkata</option></select></label>
        <label>Description <textarea name="description" data-uifn-component-use="textarea">Product workspace</textarea></label>
        <button type="submit" data-uifn-action="scenario-primary" data-uifn-component-use="button">Save settings</button>
      </form>
    `
    : scenario.slug === 'operations-dashboard'
      ? `
        <section data-uifn-scenario-workflow="operations" aria-label="Operations dashboard">
          <nav data-uifn-component-use="sidebar"><a href="#overview">Overview</a><a href="#activity">Activity</a></nav>
          <label>Filter rows <input type="search" data-uifn-action="scenario-filter" data-uifn-component-use="command" /></label>
          <table data-uifn-component-use="data-table"><thead><tr><th>Service</th><th>Score</th></tr></thead><tbody><tr><td>API</td><td>98</td></tr><tr><td>Worker</td><td>87</td></tr></tbody></table>
          <button type="button" data-uifn-action="scenario-primary" data-uifn-component-use="button">Refresh dashboard</button>
        </section>
      `
      : `
        <section data-uifn-scenario-workflow="command-center" aria-label="Command center">
          <button type="button" aria-haspopup="menu" data-uifn-component-use="dropdown-menu">Actions</button>
          <div role="menu"><button type="button" role="menuitem">Archive</button><button type="button" role="menuitem">Duplicate</button></div>
          <label>Upload file <input type="file" data-uifn-component-use="input" /></label>
          <button type="button" data-uifn-action="scenario-primary" data-uifn-component-use="button">Run command</button>
        </section>
      `;

  return `
    <section class="scenario-page" data-uifn-scenario="${escapeHtml(scenario.slug)}" tabindex="0">
      <header class="scenario-hero">
        <p class="eyebrow">Product scenario</p>
        <h2>${escapeHtml(scenario.displayName)}</h2>
        <p>${escapeHtml(scenario.description)}</p>
      </header>
      ${workflow}
      <nav class="scenario-component-links" aria-label="${escapeHtml(scenario.displayName)} component QA routes">${componentLinks}</nav>
      <section class="scenario-links" aria-label="${escapeHtml(scenario.displayName)} pattern routes">
        <h3>Controlled patterns</h3>
        <p>${patternLinks}</p>
      </section>
      <section class="scenario-links" aria-label="${escapeHtml(scenario.displayName)} Superfunction routes">
        <h3>Superfunction panels</h3>
        <p>${sfLinks}</p>
      </section>
      <output data-uifn-scenario-state>idle</output>
    </section>
  `;
}
