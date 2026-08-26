import { describe, expect, it } from 'vitest';
import {
  AuthFnApiKeyTable,
  AuthFnAuthPanel,
  AuthFnSessionList,
  AuthFnUserProfileCard,
  BillFnBillingPlanCards,
  BillFnInvoiceTable,
  BillFnSubscriptionStatusPanel,
  FileFnFileListPanel,
  FileFnFileDropzonePanel,
  FileFnQuotaUsagePanel,
  FileFnUploadProgressList,
  PlugFnOAuthConnectionsPanel,
  PlugFnProviderPicker,
  PlugFnWebhookEndpointTable,
  createMockSuperfunctionClients,
  createSuperfunctionMockDecorator,
  redactSecretLog,
} from './index';

describe('@uifn/sf backed patterns', () => {
  it('uses injected clients and exposes phase-one backed panel coverage', async () => {
    const clients = createMockSuperfunctionClients();
    const panels = await Promise.all([
      AuthFnAuthPanel({ authClient: clients.authClient }),
      AuthFnApiKeyTable({ authClient: clients.authClient }),
      AuthFnSessionList({ authClient: clients.authClient }),
      AuthFnUserProfileCard({ authClient: clients.authClient }),
      PlugFnProviderPicker({ plugClient: clients.plugClient }),
      PlugFnOAuthConnectionsPanel({ plugClient: clients.plugClient }),
      PlugFnWebhookEndpointTable({ plugClient: clients.plugClient }),
      FileFnFileDropzonePanel({ fileClient: clients.fileClient }),
      FileFnUploadProgressList({ fileClient: clients.fileClient }),
      FileFnFileListPanel({ fileClient: clients.fileClient }),
      FileFnQuotaUsagePanel({ fileClient: clients.fileClient }),
      BillFnBillingPlanCards({ billClient: clients.billClient }),
      BillFnSubscriptionStatusPanel({ billClient: clients.billClient }),
      BillFnInvoiceTable({ billClient: clients.billClient }),
    ]);

    expect(panels.map((panel) => panel.controlledCounterpart)).toEqual([
      'AuthPanel',
      'ApiKeyTable',
      'SessionList',
      'UserProfileCard',
      'ProviderPicker',
      'OAuthConnectionsPanel',
      'WebhookEndpointTable',
      'FileDropzonePanel',
      'UploadProgressList',
      'FileListPanel',
      'QuotaUsagePanel',
      'BillingPlanCards',
      'SubscriptionStatusPanel',
      'InvoiceTable',
    ]);
    expect(panels.every((panel) => panel.usesInjectedClient)).toBe(true);
    expect(panels.every((panel) => panel.mockable)).toBe(true);
    expect(panels.flatMap((panel) => panel.forbiddenReads)).toEqual([]);
  });

  it('exposes loading, error, partial, optimistic, and success states', async () => {
    const clients = createMockSuperfunctionClients();
    const states = await Promise.all([
      AuthFnApiKeyTable({ authClient: clients.authClient, status: 'loading' }),
      AuthFnApiKeyTable({ authClient: clients.authClient, status: 'empty' }),
      AuthFnApiKeyTable({ authClient: clients.authClient, status: 'error' }),
      AuthFnApiKeyTable({ authClient: clients.authClient, status: 'partial' }),
      AuthFnApiKeyTable({ authClient: clients.authClient, status: 'permission-denied' }),
      AuthFnApiKeyTable({ authClient: clients.authClient, status: 'optimistic' }),
      AuthFnApiKeyTable({ authClient: clients.authClient, status: 'success' }),
      AuthFnApiKeyTable({ authClient: clients.authClient, status: 'degraded-network' }),
      AuthFnApiKeyTable({ authClient: clients.authClient, status: 'unsupported-capability' }),
    ]);

    expect(states.map((state) => state.status)).toEqual([
      'loading',
      'empty',
      'error',
      'partial',
      'permission-denied',
      'optimistic',
      'success',
      'degraded-network',
      'unsupported-capability',
    ]);
  });

  it('redacts tokens, local paths, and PII-like emails from logs', () => {
    expect(
      redactSecretLog({
        token: ['sk', 'live', 'secret'].join('_'),
        path: `/${'Users'}/example/project`,
        tenantEmail: `person${'@'}example.com`,
        message: 'install failed',
      })
    ).toEqual({
      token: '[REDACTED]',
      path: '[REDACTED_LOCAL_PATH]',
      tenantEmail: '[REDACTED_PII]',
      message: 'install failed',
    });
  });

  it('provides fake Storybook clients and decorators', () => {
    const decorator = createSuperfunctionMockDecorator();

    expect(decorator.decorators).toContain('sf-mocks');
    expect(decorator.credentials).toEqual({
      type: 'fake',
      tenant: 'tenant_demo',
    });
    expect(decorator.clients.authClient).toBeDefined();
    expect(decorator.clients.plugClient).toBeDefined();
    expect(decorator.clients.fileClient).toBeDefined();
    expect(decorator.clients.billClient).toBeDefined();
  });
});
