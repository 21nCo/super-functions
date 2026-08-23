import { fileURLToPath } from 'node:url';
import path from 'node:path';

declare const __dirname: string | undefined;

export const UIFN_STORYBOOK_DECORATORS = [
  'theme',
  'density',
  'locale',
  'direction',
  'viewport',
  'a11y',
  'forced-colors',
  'reduced-motion',
] as const;

export const uifnStorybookPreset = {
  name: '@uifn/storybook',
  parameters: {
    uifn: { requiredForReleaseValidation: true, metadataOnlyAccepted: false },
    controls: { expanded: true },
  },
} as const;

function distributionEntry(name: 'preview' | 'manager'): string {
  const directory = typeof __dirname === 'string' ? __dirname : path.dirname(fileURLToPath(import.meta.url));
  return path.join(directory, `${name}.mjs`);
}

export function previewAnnotations(entries: string[] = []): string[] {
  return [...entries, distributionEntry('preview')];
}

export function managerEntries(entries: string[] = []): string[] {
  return [...entries, distributionEntry('manager')];
}

export default uifnStorybookPreset;
