import { PATTERN_NAMES, type PatternName, type PatternStatus } from '@uifn/patterns';
import type { UifnQaContract } from './qa-contract.js';
import { workbenchFrameworks, workbenchSfStates, workbenchThemes } from './qa-contract.js';

export interface WorkbenchPatternDefinition {
  family: 'pattern';
  name: PatternName;
  slug: string;
  displayName: string;
  statuses: PatternStatus[];
}

function slugFromName(name: string): string {
  return name.replace(/[A-Z]/g, (match, index) => `${index ? '-' : ''}${match.toLowerCase()}`);
}

function displayNameFromSlug(slug: string): string {
  return slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export const patternStatuses = [...workbenchSfStates] as PatternStatus[];

export const workbenchPatterns: WorkbenchPatternDefinition[] = PATTERN_NAMES.map((name) => {
  const slug = slugFromName(name);
  return {
    family: 'pattern',
    name,
    slug,
    displayName: displayNameFromSlug(slug),
    statuses: patternStatuses,
  };
});

export function createPatternQaContract(pattern: WorkbenchPatternDefinition): UifnQaContract {
  const routes = [
    `/patterns/${pattern.slug}`,
    `/patterns/${pattern.slug}/qa`,
    ...pattern.statuses.map((status) => `/patterns/${pattern.slug}/qa/${status}`),
  ];

  return {
    schemaVersion: 1,
    family: 'pattern',
    slug: pattern.slug,
    displayName: pattern.displayName,
    frameworks: [...workbenchFrameworks],
    qaProfile: 'layout',
    qaProfiles: ['layout'],
    requiredRoutes: routes,
    requiredStates: pattern.statuses,
    requiredInteractions: ['callback-action', 'keyboard'],
    requiredA11y: ['axe', 'landmark-name', 'keyboard'],
    requiredGeometry: ['visible-box', 'no-clipping'],
    requiredVisual: ['nonblank', 'theme-token', 'status-differentiation'],
    requiredResponsive: ['mobile', 'tablet', 'desktop'],
    requiredThemes: [...workbenchThemes],
    fixtures: pattern.statuses.map((status) => ({
      id: status,
      route: `/patterns/${pattern.slug}/qa/${status}`,
      profile: 'layout',
      args: { status },
      expectedDom: { rootSelector: `[data-uifn-pattern="${pattern.slug}"]` },
      expectedBehavior: { status },
      actions: ['activate-primary-action', 'tab-through-actions'],
      assertions: ['status-rendered', 'product-data-rendered', 'callback-fired', 'no-backend-imports'],
    })),
  };
}

export const patternQaContracts = workbenchPatterns.map(createPatternQaContract);
