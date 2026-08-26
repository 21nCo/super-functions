#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const failures = [];
const frameworks = ['react', 'svelte', 'solid'];
const states = [
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
const panels = {
  authfn: [
    ['AuthFnAuthPanel', 'authfn-auth-panel', 'AuthPanel', 'AuthFnClient', 'authClient', 'uifn/sf/src/authfn/index.ts'],
    ['AuthFnApiKeyTable', 'authfn-api-key-table', 'ApiKeyTable', 'AuthFnClient', 'authClient', 'uifn/sf/src/authfn/index.ts'],
    ['AuthFnSessionList', 'authfn-session-list', 'SessionList', 'AuthFnClient', 'authClient', 'uifn/sf/src/authfn/index.ts'],
    ['AuthFnUserProfileCard', 'authfn-user-profile-card', 'UserProfileCard', 'AuthFnClient', 'authClient', 'uifn/sf/src/authfn/index.ts'],
  ],
  plugfn: [
    ['PlugFnProviderPicker', 'plugfn-provider-picker', 'ProviderPicker', 'PlugFnClient', 'plugClient', 'uifn/sf/src/plugfn/index.ts'],
    ['PlugFnOAuthConnectionsPanel', 'plugfn-oauth-connections-panel', 'OAuthConnectionsPanel', 'PlugFnClient', 'plugClient', 'uifn/sf/src/plugfn/index.ts'],
    ['PlugFnWebhookEndpointTable', 'plugfn-webhook-endpoint-table', 'WebhookEndpointTable', 'PlugFnClient', 'plugClient', 'uifn/sf/src/plugfn/index.ts'],
  ],
  filefn: [
    ['FileFnFileDropzonePanel', 'filefn-file-dropzone-panel', 'FileDropzonePanel', 'FileFnClient', 'fileClient', 'uifn/sf/src/filefn/index.ts'],
    ['FileFnUploadProgressList', 'filefn-upload-progress-list', 'UploadProgressList', 'FileFnClient', 'fileClient', 'uifn/sf/src/filefn/index.ts'],
    ['FileFnFileListPanel', 'filefn-file-list-panel', 'FileListPanel', 'FileFnClient', 'fileClient', 'uifn/sf/src/filefn/index.ts'],
    ['FileFnQuotaUsagePanel', 'filefn-quota-usage-panel', 'QuotaUsagePanel', 'FileFnClient', 'fileClient', 'uifn/sf/src/filefn/index.ts'],
  ],
  billfn: [
    ['BillFnBillingPlanCards', 'billfn-billing-plan-cards', 'BillingPlanCards', 'BillFnClient', 'billClient', 'uifn/sf/src/billfn/index.ts'],
    ['BillFnSubscriptionStatusPanel', 'billfn-subscription-status-panel', 'SubscriptionStatusPanel', 'BillFnClient', 'billClient', 'uifn/sf/src/billfn/index.ts'],
    ['BillFnInvoiceTable', 'billfn-invoice-table', 'InvoiceTable', 'BillFnClient', 'billClient', 'uifn/sf/src/billfn/index.ts'],
  ],
};
const forbiddenReads = ['globalThis.authfn', 'localStorage.authToken', 'process.env.AUTHFN_TOKEN'];

function file(pathname) {
  return path.join(repoRoot, pathname);
}

function read(pathname) {
  return readFileSync(file(pathname), 'utf8');
}

function readJson(pathname) {
  return JSON.parse(read(pathname));
}

function fail(code, details = {}) {
  failures.push({ code, ...details });
}

function requireFile(pathname, code) {
  if (!existsSync(file(pathname))) {
    fail(code, { path: pathname });
    return false;
  }

  return true;
}

for (const [backing, entries] of Object.entries(panels)) {
  for (const [name, slug, counterpart, contract, clientProp, sourcePath] of entries) {
    if (requireFile(sourcePath, 'UIFN_SF_SOURCE_MISSING')) {
      const source = read(sourcePath);
      for (const token of [name, contract, clientProp]) {
        if (!source.includes(token)) {
          fail('UIFN_SF_CONTRACT_TOKEN_MISSING', { slug, token });
        }
      }
      for (const forbidden of forbiddenReads) {
        if (source.includes(forbidden)) {
          fail('UIFN_SF_GLOBAL_CLIENT_FORBIDDEN', { slug, forbidden });
        }
      }
    }

    const manifestPath = `uifn/registry/catalog/sf/${slug}.json`;
    const fixturePath = `uifn/sf/fixtures/${slug}.fixture.json`;
    const storyPath = `uifn/sf/stories/${slug}.stories.json`;
    if (!requireFile(manifestPath, 'UIFN_SF_MANIFEST_MISSING')) {
      continue;
    }
    requireFile(fixturePath, 'UIFN_SF_FIXTURE_MISSING');
    requireFile(storyPath, 'UIFN_SF_STORY_MISSING');

    const manifest = readJson(manifestPath);
    if (manifest.kind !== 'sf-pattern' || manifest.backing?.[0] !== backing || manifest.controlledCounterpart !== counterpart) {
      fail('UIFN_SF_MANIFEST_INVALID', { slug });
    }
    if (!manifest.props?.includes(clientProp)) {
      fail('UIFN_SF_CLIENT_PROP_MISSING', { slug, clientProp });
    }
    for (const framework of frameworks) {
      const metadata = manifest.frameworks?.[framework];
      if (!metadata?.supported || !metadata.packageImport || !metadata.sourceInstall?.helperFile) {
        fail('UIFN_SF_FRAMEWORK_METADATA_MISSING', { slug, framework });
      }
    }
    for (const state of states) {
      if (!manifest.states?.includes(state)) {
        fail('UIFN_SF_STATE_MISSING', { slug, state });
      }
    }

    if (!existsSync(file(fixturePath)) || !existsSync(file(storyPath))) {
      continue;
    }
    const fixture = readJson(fixturePath);
    if (!fixture.usesInjectedClient || fixture.forbiddenReads?.length !== 0) {
      fail('UIFN_SF_INJECTED_CLIENT_CONTRACT_MISSING', { slug });
    }
    for (const state of states) {
      if (!fixture.states?.[state]) {
        fail('UIFN_SF_FIXTURE_STATE_MISSING', { slug, state });
      }
    }
    const story = readJson(storyPath);
    if (!story.decorators?.includes('sf-mocks') || story.credentials?.type !== 'fake') {
      fail('UIFN_STORYBOOK_METADATA_MISSING', { slug });
    }
    const storyIds = new Set((story.stories ?? []).map((entry) => entry.id));
    for (const state of states) {
      if (!storyIds.has(state)) {
        fail('UIFN_SF_STORY_STATE_MISSING', { slug, state });
      }
    }
  }
}

const manifestDir = file('uifn/registry/catalog/sf');
const actual = existsSync(manifestDir) ? readdirSync(manifestDir).filter((entry) => entry.endsWith('.json')).length : 0;
const expected = Object.values(panels).flat().length;
if (actual !== expected) {
  fail('UIFN_SF_PANEL_COUNT_MISMATCH', { expected, actual });
}

if (failures.length > 0) {
  console.error(JSON.stringify({ ok: false, command: 'verify:uifn-sf', failures }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      command: 'verify:uifn-sf',
      panelCount: expected,
      controlledCounterparts: true,
      sfBackedVariants: true,
      usesInjectedClient: true,
      states,
      forbiddenReads: [],
    },
    null,
    2
  )
);
