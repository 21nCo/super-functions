import { readFileSync } from 'node:fs';
import path from 'node:path';
import { findRepoRoot } from './paths';

export type StoryCheck = 'interaction' | 'a11y' | 'visual';

export interface StoryValidationError {
  code: string;
  story?: string;
  path?: string;
  message: string;
}

export interface StoryInventoryEntry {
  id: string;
  title: string;
  exportName: string;
  framework: 'react' | 'svelte' | 'solid';
  primitive: string;
  scenario: string;
  anatomyPartCount: number;
  publicPackage: string;
  publicImport: string;
}

export interface StoryValidationResult {
  ok: boolean;
  storyCount: number;
  primitiveCount: number;
  frameworkCount: number;
  sourceModuleCount: number;
  errors: StoryValidationError[];
}

interface StoryInventory {
  storyCount: number;
  primitiveCount: number;
  frameworks: string[];
  stories: StoryInventoryEntry[];
}

function sourcePath(entry: StoryInventoryEntry): string {
  const extension = entry.framework === 'svelte' ? 'ts' : 'tsx';
  return `uifn/storybook/workbenches/${entry.framework}/stories/${entry.primitive}.stories.${extension}`;
}

export function inspectStorySource(source: string, entry: Pick<StoryInventoryEntry, 'primitive' | 'framework' | 'publicImport'>): StoryValidationError[] {
  const errors: StoryValidationError[] = [];
  if (!source.includes(`from '${entry.publicImport}'`) && !source.includes(`from "${entry.publicImport}"`)) {
    errors.push({ code: 'UIFN_STORY_NOT_PUBLIC_COMPONENT', message: `${entry.primitive}/${entry.framework} does not import its public styled package subpath.` });
  }
  if (!source.includes('StoryHarness') || /component\s*:\s*['"](?:div|span|button)['"]/.test(source) || /render\s*:\s*\(\)\s*=>\s*<div\b/.test(source)) {
    errors.push({ code: 'UIFN_STORY_NOT_PUBLIC_COMPONENT', message: `${entry.primitive}/${entry.framework} mounts a static test double.` });
  }
  return errors;
}

export function reconcileBuiltStoryIds(expected: readonly string[], actual: readonly string[]): StoryValidationError[] {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  return [
    ...expected.filter((id) => !actualSet.has(id)).map((story) => ({ code: 'UIFN_STORY_MISSING', story, message: `Built Storybook is missing ${story}.` })),
    ...actual.filter((id) => !expectedSet.has(id)).map((story) => ({ code: 'UIFN_STORY_UNEXPECTED', story, message: `Built Storybook contains unexpected story ${story}.` })),
  ];
}

export function evaluateStoryCheckResults(results: Partial<Record<StoryCheck, boolean>>): { ok: true } | { ok: false; error: StoryValidationError } {
  if (results.a11y === false) return { ok: false, error: { code: 'UIFN_STORY_A11Y_FAILED', message: 'A11y story check failed' } };
  if (results.interaction === false) return { ok: false, error: { code: 'UIFN_STORY_INTERACTION_FAILED', message: 'Interaction story check failed' } };
  if (results.visual === false) return { ok: false, error: { code: 'UIFN_STORY_VISUAL_FAILED', message: 'Visual story check failed' } };
  return { ok: true };
}

export function validateStories(repoRoot = findRepoRoot()): StoryValidationResult {
  const inventory = JSON.parse(readFileSync(path.join(repoRoot, 'uifn/storybook/generated/story-inventory.json'), 'utf8')) as StoryInventory;
  const errors: StoryValidationError[] = [];
  const modules = new Map<string, StoryInventoryEntry>();
  for (const entry of inventory.stories) modules.set(sourcePath(entry), entry);
  for (const [relative, entry] of modules) {
    const source = readFileSync(path.join(repoRoot, relative), 'utf8');
    errors.push(...inspectStorySource(source, entry).map((error) => ({ ...error, path: relative })));
  }
  if (new Set(inventory.stories.map((story) => `${story.framework}:${story.id}`)).size !== inventory.storyCount) {
    errors.push({ code: 'UIFN_STORY_DUPLICATE', message: 'Canonical story inventory contains duplicate framework/story ids.' });
  }
  return {
    ok: errors.length === 0,
    storyCount: inventory.storyCount,
    primitiveCount: inventory.primitiveCount,
    frameworkCount: inventory.frameworks.length,
    sourceModuleCount: modules.size,
    errors,
  };
}
