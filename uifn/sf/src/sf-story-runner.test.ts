import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AuthFnApiKeyTable,
  AuthFnAuthPanel,
  AuthFnSessionList,
  AuthFnUserProfileCard,
  BillFnBillingPlanCards,
  BillFnInvoiceTable,
  BillFnSubscriptionStatusPanel,
  FileFnFileDropzonePanel,
  FileFnFileListPanel,
  FileFnQuotaUsagePanel,
  FileFnUploadProgressList,
  PlugFnOAuthConnectionsPanel,
  PlugFnProviderPicker,
  PlugFnWebhookEndpointTable,
  createMockSuperfunctionClients,
  type SfPatternModel,
} from './index';
import type { PatternName, PatternStatus } from '@uifn/patterns';

interface SfStoryEntry {
  id: PatternStatus | 'visual';
  args?: Record<string, unknown>;
  controls?: string[];
  testUse?: Array<'interaction' | 'a11y' | 'visual'>;
  themes?: string[];
  viewport?: string[];
}

interface SfStoryFile {
  schemaVersion: number;
  sfPattern: string;
  slug: string;
  decorators?: string[];
  credentials?: { type?: string; tenant?: string };
  compatibilityPanel?: {
    backing?: string[];
    controlledCounterpart?: PatternName;
    clientContract?: string;
  };
  stories: SfStoryEntry[];
}

type StoryRunner = (status: PatternStatus) => Promise<SfPatternModel>;

const repoRoot = path.resolve(process.cwd(), '../..');
const storyRoot = 'uifn/sf/stories';

function readJson<T>(pathname: string): T {
  return JSON.parse(readFileSync(path.join(repoRoot, pathname), 'utf8')) as T;
}

function listStoryFiles(): string[] {
  const absoluteRoot = path.join(repoRoot, storyRoot);
  if (!existsSync(absoluteRoot)) {
    return [];
  }

  return readdirSync(absoluteRoot)
    .filter((entry) => entry.endsWith('.stories.json'))
    .map((entry) => path.join(storyRoot, entry))
    .sort();
}

function storyStatus(story: SfStoryEntry): PatternStatus {
  if (story.id === 'visual') {
    return 'success';
  }

  return String(story.args?.status ?? story.id) as PatternStatus;
}

function createRunners(): Record<string, StoryRunner> {
  const clients = createMockSuperfunctionClients();
  return {
    'authfn-auth-panel': (status) => AuthFnAuthPanel({ authClient: clients.authClient, status }),
    'authfn-api-key-table': (status) => AuthFnApiKeyTable({ authClient: clients.authClient, status }),
    'authfn-session-list': (status) => AuthFnSessionList({ authClient: clients.authClient, status }),
    'authfn-user-profile-card': (status) => AuthFnUserProfileCard({ authClient: clients.authClient, status }),
    'plugfn-provider-picker': (status) => PlugFnProviderPicker({ plugClient: clients.plugClient, status }),
    'plugfn-oauth-connections-panel': (status) => PlugFnOAuthConnectionsPanel({ plugClient: clients.plugClient, status }),
    'plugfn-webhook-endpoint-table': (status) => PlugFnWebhookEndpointTable({ plugClient: clients.plugClient, status }),
    'filefn-file-dropzone-panel': (status) => FileFnFileDropzonePanel({ fileClient: clients.fileClient, status }),
    'filefn-upload-progress-list': (status) => FileFnUploadProgressList({ fileClient: clients.fileClient, status }),
    'filefn-file-list-panel': (status) => FileFnFileListPanel({ fileClient: clients.fileClient, status }),
    'filefn-quota-usage-panel': (status) => FileFnQuotaUsagePanel({ fileClient: clients.fileClient, status }),
    'billfn-billing-plan-cards': (status) => BillFnBillingPlanCards({ billClient: clients.billClient, status }),
    'billfn-subscription-status-panel': (status) => BillFnSubscriptionStatusPanel({ billClient: clients.billClient, status }),
    'billfn-invoice-table': (status) => BillFnInvoiceTable({ billClient: clients.billClient, status }),
  };
}

describe('generated Storybook Superfunction-backed stories', () => {
  it('executes every backed story entry through injected fake clients', async () => {
    const runners = createRunners();
    const storyFiles = listStoryFiles().map((pathname) => readJson<SfStoryFile>(pathname));
    const expectedStoryCount = storyFiles.reduce((total, storyFile) => total + storyFile.stories.length, 0);
    const executed = new Set<string>();

    expect(storyFiles).toHaveLength(Object.keys(runners).length);

    for (const storyFile of storyFiles) {
      expect(storyFile.schemaVersion).toBe(1);
      expect(storyFile.decorators).toContain('sf-mocks');
      expect(storyFile.credentials).toMatchObject({ type: 'fake' });
      expect(runners[storyFile.slug]).toBeDefined();

      for (const story of storyFile.stories) {
        expect(story.controls?.length).toBeGreaterThan(0);
        const model = await runners[storyFile.slug](storyStatus(story));

        expect(model.status).toBe(storyStatus(story));
        expect(model.usesInjectedClient).toBe(true);
        expect(model.mockable).toBe(true);
        expect(model.forbiddenReads).toEqual([]);
        expect(model.controlledCounterpart).toBe(storyFile.compatibilityPanel?.controlledCounterpart);
        expect(model.clientContract).toBe(storyFile.compatibilityPanel?.clientContract);
        expect(model.superfunction).toBe(storyFile.compatibilityPanel?.backing?.[0]);

        if (story.testUse?.includes('visual')) {
          expect(story.themes).toEqual(expect.arrayContaining(['high-contrast']));
          expect(story.viewport).toEqual(expect.arrayContaining(['mobile', 'desktop']));
        }

        executed.add(`${storyFile.slug}:${story.id}`);
      }
    }

    expect(executed.size).toBe(expectedStoryCount);
  });
});
