import { describe, expect, it } from 'vitest';
import {
  ApiKeyTable,
  BillingPlanCards,
  PATTERN_NAMES,
  ProviderPicker,
  createPatternModel,
  type PatternStatus,
} from './index';

const REQUIRED_STATES: PatternStatus[] = [
  'loading',
  'empty',
  'error',
  'partial',
  'permission-denied',
  'optimistic',
  'success',
  'degraded-network',
  'unsupported-capability',
];

describe('@uifn/patterns controlled product patterns', () => {
  it('exposes the complete phase-one controlled pattern catalog', () => {
    expect(PATTERN_NAMES).toEqual([
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
  });

  it('keeps ApiKeyTable backend agnostic with explicit data, callbacks, and status', () => {
    const model = ApiKeyTable({
      status: 'success',
      keys: [
        {
          id: 'key_1',
          name: 'Production',
          prefix: 'sk_live',
          createdAt: '2026-06-27',
        },
      ],
      onCreate: () => undefined,
      onRevoke: () => undefined,
    });

    expect(model.status).toBe('success');
    expect(model.state.itemCount).toBe(1);
    expect(model.callbacks).toEqual(['onCreate', 'onRevoke']);
    expect(model.imports).toEqual(['@uifn/components-react']);
    expect(model.backendImports).toEqual([]);
  });

  it('represents every required state without changing the public pattern API', () => {
    for (const status of REQUIRED_STATES) {
      const model = createPatternModel('ProviderPicker', {
        status,
        data: [],
      });

      expect(model.status).toBe(status);
      expect(Object.values(model.state).filter(Boolean).length).toBe(status === 'empty' ? 1 : 1);
    }
  });

  it('supports provider and billing product flows with controlled callbacks', () => {
    const provider = ProviderPicker({
      status: 'partial',
      providers: [
        { id: 'github', label: 'GitHub', connected: true },
        { id: 'slack', label: 'Slack', disabled: true },
      ],
      onSelect: () => undefined,
    });

    const billing = BillingPlanCards({
      status: 'optimistic',
      plans: [
        { id: 'pro', name: 'Pro', price: '$20', features: ['Seats', 'Usage'], current: true },
      ],
      onSelectPlan: () => undefined,
    });

    expect(provider.state.partial).toBe(true);
    expect(provider.state.itemCount).toBe(2);
    expect(provider.callbacks).toEqual(['onSelect']);
    expect(billing.state.optimistic).toBe(true);
    expect(billing.callbacks).toEqual(['onSelectPlan']);
  });
});
