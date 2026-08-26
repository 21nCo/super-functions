import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ApiKeyTable,
  AuthPanel,
  BillingPlanCards,
  FileDropzonePanel,
  FileListPanel,
  InvoiceTable,
  OAuthConnectionsPanel,
  PATTERN_NAMES,
  ProviderPicker,
  QuotaUsagePanel,
  SessionList,
  SubscriptionStatusPanel,
  UploadProgressList,
  UserProfileCard,
  WebhookEndpointTable,
  type PatternName,
  type PatternRenderModel,
  type PatternStatus,
} from './index';

interface PatternStoryEntry {
  id: PatternStatus | 'visual';
  args?: Record<string, unknown>;
  controls?: string[];
  testUse?: Array<'interaction' | 'a11y' | 'visual'>;
  themes?: string[];
  viewport?: string[];
}

interface PatternStoryFile {
  schemaVersion: number;
  pattern: PatternName;
  slug: string;
  stories: PatternStoryEntry[];
}

const repoRoot = path.resolve(process.cwd(), '../..');
const storyRoot = 'uifn/patterns/stories';

const patternFns: Record<PatternName, (props: Record<string, unknown>) => PatternRenderModel> = {
  AuthPanel: (props) => AuthPanel(props as unknown as Parameters<typeof AuthPanel>[0]),
  ApiKeyTable: (props) => ApiKeyTable(props as unknown as Parameters<typeof ApiKeyTable>[0]),
  SessionList: (props) => SessionList(props as unknown as Parameters<typeof SessionList>[0]),
  UserProfileCard: (props) => UserProfileCard(props as unknown as Parameters<typeof UserProfileCard>[0]),
  ProviderPicker: (props) => ProviderPicker(props as unknown as Parameters<typeof ProviderPicker>[0]),
  OAuthConnectionsPanel: (props) => OAuthConnectionsPanel(props as unknown as Parameters<typeof OAuthConnectionsPanel>[0]),
  WebhookEndpointTable: (props) => WebhookEndpointTable(props as unknown as Parameters<typeof WebhookEndpointTable>[0]),
  FileDropzonePanel: (props) => FileDropzonePanel(props as unknown as Parameters<typeof FileDropzonePanel>[0]),
  UploadProgressList: (props) => UploadProgressList(props as unknown as Parameters<typeof UploadProgressList>[0]),
  FileListPanel: (props) => FileListPanel(props as unknown as Parameters<typeof FileListPanel>[0]),
  QuotaUsagePanel: (props) => QuotaUsagePanel(props as unknown as Parameters<typeof QuotaUsagePanel>[0]),
  BillingPlanCards: (props) => BillingPlanCards(props as unknown as Parameters<typeof BillingPlanCards>[0]),
  SubscriptionStatusPanel: (props) => SubscriptionStatusPanel(props as unknown as Parameters<typeof SubscriptionStatusPanel>[0]),
  InvoiceTable: (props) => InvoiceTable(props as unknown as Parameters<typeof InvoiceTable>[0]),
};

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

function storyStatus(story: PatternStoryEntry): PatternStatus {
  if (story.id === 'visual') {
    return 'success';
  }

  return String(story.args?.status ?? story.id) as PatternStatus;
}

function storyProps(story: PatternStoryEntry): Record<string, unknown> {
  return {
    status: storyStatus(story),
    onCreate: () => undefined,
    onRevoke: () => undefined,
    onSelect: () => undefined,
    onUpload: () => undefined,
    onRemove: () => undefined,
    onManage: () => undefined,
    onDownload: () => undefined,
    ...story.args,
  };
}

describe('generated Storybook controlled pattern stories', () => {
  it('executes every controlled pattern story entry through the public pattern models', () => {
    const storyFiles = listStoryFiles().map((pathname) => readJson<PatternStoryFile>(pathname));
    const expectedStoryCount = storyFiles.reduce((total, storyFile) => total + storyFile.stories.length, 0);
    const executed = new Set<string>();

    expect(storyFiles).toHaveLength(PATTERN_NAMES.length);

    for (const storyFile of storyFiles) {
      expect(storyFile.schemaVersion).toBe(1);
      expect(PATTERN_NAMES).toContain(storyFile.pattern);
      for (const story of storyFile.stories) {
        expect(story.controls?.length).toBeGreaterThan(0);
        const model = patternFns[storyFile.pattern](storyProps(story));

        expect(model.name).toBe(storyFile.pattern);
        expect(model.status).toBe(storyStatus(story));
        expect(model.backendImports).toEqual([]);
        expect(model.imports).toEqual(['@uifn/components-react']);

        if (story.testUse?.includes('interaction')) {
          expect(model.callbacks.length).toBeGreaterThan(0);
        }

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
