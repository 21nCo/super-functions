import type { PatternStatus } from '@uifn/patterns';
import type { UifnQaContract } from './qa-contract.js';
import { workbenchFrameworks, workbenchSfStates, workbenchThemes } from './qa-contract.js';

export interface WorkbenchSfPanelDefinition {
  family: 'sf';
  name: string;
  slug: string;
  displayName: string;
  superfunction: 'authfn' | 'plugfn' | 'filefn' | 'billfn';
  controlledCounterpart: string;
  clientContract: string;
  statuses: PatternStatus[];
}

function displayNameFromSlug(slug: string): string {
  return slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export const workbenchSfPanels: WorkbenchSfPanelDefinition[] = [
  ['authfn', 'AuthFnAuthPanel', 'authfn-auth-panel', 'AuthPanel', 'AuthFnClient'],
  ['authfn', 'AuthFnApiKeyTable', 'authfn-api-key-table', 'ApiKeyTable', 'AuthFnClient'],
  ['authfn', 'AuthFnSessionList', 'authfn-session-list', 'SessionList', 'AuthFnClient'],
  ['authfn', 'AuthFnUserProfileCard', 'authfn-user-profile-card', 'UserProfileCard', 'AuthFnClient'],
  ['plugfn', 'PlugFnProviderPicker', 'plugfn-provider-picker', 'ProviderPicker', 'PlugFnClient'],
  ['plugfn', 'PlugFnOAuthConnectionsPanel', 'plugfn-oauth-connections-panel', 'OAuthConnectionsPanel', 'PlugFnClient'],
  ['plugfn', 'PlugFnWebhookEndpointTable', 'plugfn-webhook-endpoint-table', 'WebhookEndpointTable', 'PlugFnClient'],
  ['filefn', 'FileFnFileDropzonePanel', 'filefn-file-dropzone-panel', 'FileDropzonePanel', 'FileFnClient'],
  ['filefn', 'FileFnUploadProgressList', 'filefn-upload-progress-list', 'UploadProgressList', 'FileFnClient'],
  ['filefn', 'FileFnFileListPanel', 'filefn-file-list-panel', 'FileListPanel', 'FileFnClient'],
  ['filefn', 'FileFnQuotaUsagePanel', 'filefn-quota-usage-panel', 'QuotaUsagePanel', 'FileFnClient'],
  ['billfn', 'BillFnBillingPlanCards', 'billfn-billing-plan-cards', 'BillingPlanCards', 'BillFnClient'],
  ['billfn', 'BillFnSubscriptionStatusPanel', 'billfn-subscription-status-panel', 'SubscriptionStatusPanel', 'BillFnClient'],
  ['billfn', 'BillFnInvoiceTable', 'billfn-invoice-table', 'InvoiceTable', 'BillFnClient'],
].map(([superfunction, name, slug, controlledCounterpart, clientContract]) => ({
  family: 'sf',
  name,
  slug,
  displayName: displayNameFromSlug(slug),
  superfunction,
  controlledCounterpart,
  clientContract,
  statuses: [...workbenchSfStates],
} as WorkbenchSfPanelDefinition));

export function createSfQaContract(panel: WorkbenchSfPanelDefinition): UifnQaContract {
  const routes = [
    `/sf/${panel.slug}`,
    `/sf/${panel.slug}/qa`,
    ...panel.statuses.map((status) => `/sf/${panel.slug}/qa/${status}`),
  ];

  return {
    schemaVersion: 1,
    family: 'sf',
    slug: panel.slug,
    displayName: panel.displayName,
    frameworks: [...workbenchFrameworks],
    qaProfile: 'layout',
    qaProfiles: ['layout'],
    requiredRoutes: routes,
    requiredStates: panel.statuses,
    requiredInteractions: ['fake-client-action', 'keyboard'],
    requiredA11y: ['axe', 'landmark-name', 'keyboard'],
    requiredGeometry: ['visible-box', 'no-clipping'],
    requiredVisual: ['nonblank', 'theme-token', 'status-differentiation'],
    requiredResponsive: ['mobile', 'tablet', 'desktop'],
    requiredThemes: [...workbenchThemes],
    fixtures: panel.statuses.map((status) => ({
      id: status,
      route: `/sf/${panel.slug}/qa/${status}`,
      profile: 'layout',
      args: { status, injectedClient: panel.clientContract },
      expectedDom: { rootSelector: `[data-uifn-sf="${panel.slug}"]` },
      expectedBehavior: { status, usesInjectedClient: true, noLiveNetwork: true },
      actions: ['activate-primary-action', 'tab-through-actions'],
      assertions: ['status-rendered', 'product-data-rendered', 'injected-client-called', 'no-live-network'],
    })),
  };
}

export const sfQaContracts = workbenchSfPanels.map(createSfQaContract);
