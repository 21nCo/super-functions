import type {
  ApiKeyRecord,
  AuthPanelData,
  BillingPlanRecord,
  FileRecord,
  InvoiceRecord,
  OAuthConnectionRecord,
  ProviderRecord,
  QuotaUsageData,
  SessionRecord,
  SubscriptionStatusData,
  UploadProgressRecord,
  UserProfileData,
  WebhookEndpointRecord,
} from '@uifn/patterns';
import type { AuthFnClient } from '../authfn';
import type { BillFnClient } from '../billfn';
import type { FileFnClient } from '../filefn';
import type { PlugFnClient } from '../plugfn';

type MockCallMap = Record<string, number>;

export interface MockSuperfunctionCallTracker {
  getCallSummary(): MockCallMap;
  resetCallSummary(): void;
}

function createCallTracker(): MockSuperfunctionCallTracker & { record(client: string, method: string): void } {
  const calls: MockCallMap = {};
  return {
    record(client, method) {
      const key = `${client}.${method}`;
      calls[key] = (calls[key] ?? 0) + 1;
    },
    getCallSummary() {
      return { ...calls };
    },
    resetCallSummary() {
      Object.keys(calls).forEach((key) => delete calls[key]);
    },
  };
}

function tracked<TArgs extends unknown[], TResult>(
  tracker: Pick<ReturnType<typeof createCallTracker>, 'record'>,
  client: string,
  method: string,
  handler: (...args: TArgs) => Promise<TResult>
): (...args: TArgs) => Promise<TResult> {
  return async (...args) => {
    tracker.record(client, method);
    return handler(...args);
  };
}

export function getMockSuperfunctionCallSummary(tracker?: MockSuperfunctionCallTracker): MockCallMap {
  return tracker?.getCallSummary() ?? {};
}

export function resetMockSuperfunctionCallSummary(tracker?: MockSuperfunctionCallTracker): void {
  tracker?.resetCallSummary();
}

export function createMockAuthFnClient(callTracker = createCallTracker()): AuthFnClient {
  const apiKeys: ApiKeyRecord[] = [
    {
      id: 'key_demo_1',
      name: 'Demo key',
      prefix: 'uifn_demo',
      createdAt: '2026-06-27',
      lastUsedAt: null,
    },
  ];

  const authPanelData: AuthPanelData = {
    user: {
      id: 'user_demo_1',
      name: 'Demo User',
      email: ['demo', 'example.invalid'].join('@'),
    },
    providers: [
      { id: 'github', label: 'GitHub', connected: true },
      { id: 'google', label: 'Google', connected: false },
    ],
  };
  const sessions: SessionRecord[] = [
    {
      id: 'session_demo_1',
      device: 'Demo browser',
      location: 'Demo region',
      current: true,
      lastActiveAt: '2026-06-27T12:00:00Z',
    },
  ];
  const profile: UserProfileData = {
    id: 'user_demo_1',
    name: 'Demo User',
    email: ['demo', 'example.invalid'].join('@'),
    avatarUrl: null,
  };

  return {
    getAuthPanelData: tracked(callTracker, 'authfn', 'getAuthPanelData', async () => authPanelData),
    listApiKeys: tracked(callTracker, 'authfn', 'listApiKeys', async () => apiKeys),
    listSessions: tracked(callTracker, 'authfn', 'listSessions', async () => sessions),
    getUserProfile: tracked(callTracker, 'authfn', 'getUserProfile', async () => profile),
    createApiKey: tracked(callTracker, 'authfn', 'createApiKey', async () => apiKeys[0]),
    revokeApiKey: tracked(callTracker, 'authfn', 'revokeApiKey', async () => undefined),
    revokeSession: tracked(callTracker, 'authfn', 'revokeSession', async () => undefined),
    updateProfile: tracked(callTracker, 'authfn', 'updateProfile', async (nextProfile) => ({ ...profile, ...nextProfile })),
    signIn: tracked(callTracker, 'authfn', 'signIn', async () => undefined),
    signOut: tracked(callTracker, 'authfn', 'signOut', async () => undefined),
    switchAccount: tracked(callTracker, 'authfn', 'switchAccount', async () => undefined),
  };
}

export function createMockPlugFnClient(callTracker = createCallTracker()): PlugFnClient {
  const providers: ProviderRecord[] = [
    { id: 'github', label: 'GitHub', connected: true },
    { id: 'slack', label: 'Slack', connected: false },
  ];
  const connections: OAuthConnectionRecord[] = [
    {
      id: 'conn_demo_1',
      providerId: 'github',
      accountLabel: 'demo-org',
      status: 'connected',
    },
  ];
  const endpoints: WebhookEndpointRecord[] = [
    {
      id: 'webhook_demo_1',
      url: 'https://example.invalid/uifn/webhook',
      events: ['connection.created'],
      enabled: true,
    },
  ];

  return {
    listProviders: tracked(callTracker, 'plugfn', 'listProviders', async () => providers),
    listConnections: tracked(callTracker, 'plugfn', 'listConnections', async () => connections),
    listWebhookEndpoints: tracked(callTracker, 'plugfn', 'listWebhookEndpoints', async () => endpoints),
    connectProvider: tracked(callTracker, 'plugfn', 'connectProvider', async () => undefined),
    disconnectConnection: tracked(callTracker, 'plugfn', 'disconnectConnection', async () => undefined),
    createWebhookEndpoint: tracked(callTracker, 'plugfn', 'createWebhookEndpoint', async () => endpoints[0]),
    rotateWebhookSecret: tracked(callTracker, 'plugfn', 'rotateWebhookSecret', async () => undefined),
    deleteWebhookEndpoint: tracked(callTracker, 'plugfn', 'deleteWebhookEndpoint', async () => undefined),
  };
}

export function createMockFileFnClient(callTracker = createCallTracker()): FileFnClient {
  const files: FileRecord[] = [
    {
      id: 'file_demo_1',
      name: 'demo.pdf',
      size: 1200,
      status: 'uploaded',
    },
  ];
  const uploads: UploadProgressRecord[] = [
    {
      id: 'upload_demo_1',
      name: 'demo.pdf',
      progress: 64,
      status: 'uploading',
    },
  ];
  const quota: QuotaUsageData = {
    label: 'Demo storage',
    used: 512,
    limit: 1024,
    unit: 'MB',
  };

  return {
    listFiles: tracked(callTracker, 'filefn', 'listFiles', async () => files),
    listUploads: tracked(callTracker, 'filefn', 'listUploads', async () => uploads),
    getQuotaUsage: tracked(callTracker, 'filefn', 'getQuotaUsage', async () => quota),
    uploadFiles: tracked(callTracker, 'filefn', 'uploadFiles', async () => files),
    cancelUpload: tracked(callTracker, 'filefn', 'cancelUpload', async () => undefined),
    openFile: tracked(callTracker, 'filefn', 'openFile', async () => undefined),
    removeFile: tracked(callTracker, 'filefn', 'removeFile', async () => undefined),
    upgradeQuota: tracked(callTracker, 'filefn', 'upgradeQuota', async () => undefined),
  };
}

export function createMockBillFnClient(callTracker = createCallTracker()): BillFnClient {
  const plans: BillingPlanRecord[] = [
    {
      id: 'starter',
      name: 'Starter',
      price: '$0',
      current: true,
      features: ['Demo usage'],
    },
    {
      id: 'pro',
      name: 'Pro',
      price: '$20',
      features: ['More demo usage'],
    },
  ];
  const subscription: SubscriptionStatusData = {
    planName: 'Starter',
    status: 'active',
    renewalDate: '2026-07-27',
  };
  const invoices: InvoiceRecord[] = [
    {
      id: 'invoice_demo_1',
      number: 'INV-DEMO-001',
      amount: '$0.00',
      status: 'paid',
      issuedAt: '2026-06-27',
    },
  ];

  return {
    listPlans: tracked(callTracker, 'billfn', 'listPlans', async () => plans),
    getSubscription: tracked(callTracker, 'billfn', 'getSubscription', async () => subscription),
    listInvoices: tracked(callTracker, 'billfn', 'listInvoices', async () => invoices),
    selectPlan: tracked(callTracker, 'billfn', 'selectPlan', async () => undefined),
    manageSubscription: tracked(callTracker, 'billfn', 'manageSubscription', async () => undefined),
    cancelSubscription: tracked(callTracker, 'billfn', 'cancelSubscription', async () => undefined),
    downloadInvoice: tracked(callTracker, 'billfn', 'downloadInvoice', async () => undefined),
  };
}

export function createMockSuperfunctionClients() {
  const callTracker = createCallTracker();
  return {
    authClient: createMockAuthFnClient(callTracker),
    plugClient: createMockPlugFnClient(callTracker),
    fileClient: createMockFileFnClient(callTracker),
    billClient: createMockBillFnClient(callTracker),
    getCallSummary: callTracker.getCallSummary,
    resetCallSummary: callTracker.resetCallSummary,
  };
}

export function createSuperfunctionMockDecorator() {
  return {
    name: 'uifn-sf-mocks',
    decorators: ['theme', 'density', 'locale', 'viewport', 'a11y', 'sf-mocks'],
    credentials: {
      type: 'fake',
      tenant: 'tenant_demo',
    },
    clients: createMockSuperfunctionClients(),
  };
}
