import type { ExampleAdapterId } from './scenarios.js';

export type UifnContractFamily = 'component' | 'pattern' | 'sf';
export type UifnWorkbenchFamily = UifnContractFamily | 'scenario';
export type UifnQaProfile =
  | 'static'
  | 'control'
  | 'form'
  | 'overlay'
  | 'navigation'
  | 'feedback'
  | 'layout'
  | 'data-rich'
  | 'typography';
export type UifnWorkbenchTheme = 'light' | 'dark' | 'high-contrast-light' | 'high-contrast-dark';

export interface UifnQaFixture {
  id: string;
  route: string;
  profile?: UifnQaProfile;
  args: Record<string, unknown>;
  expectedDom: Record<string, unknown>;
  expectedBehavior: Record<string, unknown>;
  actions: string[];
  assertions: string[];
}

export interface UifnQaContract {
  schemaVersion: 1;
  family: UifnContractFamily;
  slug: string;
  displayName: string;
  frameworks: ExampleAdapterId[];
  qaProfile: UifnQaProfile;
  qaProfiles: UifnQaProfile[];
  requiredRoutes: string[];
  requiredStates: string[];
  requiredInteractions: string[];
  requiredA11y: string[];
  requiredGeometry: string[];
  requiredVisual: string[];
  requiredResponsive: string[];
  requiredThemes: UifnWorkbenchTheme[];
  fixtures: UifnQaFixture[];
}

export interface UifnBrowserQaCheck {
  id: string;
  family: UifnWorkbenchFamily;
  slug: string;
  framework: ExampleAdapterId;
  route: string;
  status: 'passed' | 'failed';
  evidence: Record<string, unknown>;
}

export interface UifnBrowserQaFailure {
  code: string;
  message: string;
  slug?: string;
  framework?: ExampleAdapterId;
  route?: string;
  qaCaseId?: string;
  assertionType?: string;
  evidence?: Record<string, unknown>;
  artifacts?: string[];
}

export interface UifnBrowserQaResult {
  ok: boolean;
  command: string;
  schemaVersion: 1;
  frameworkCount: number;
  componentCount: number;
  patternCount: number;
  sfPanelCount: number;
  routeCount: number;
  checks: UifnBrowserQaCheck[];
  failures: UifnBrowserQaFailure[];
}

export const workbenchFrameworks = ['react', 'svelte', 'solid'] as const satisfies readonly ExampleAdapterId[];
export const workbenchThemes = ['light', 'dark', 'high-contrast-light', 'high-contrast-dark'] as const satisfies readonly UifnWorkbenchTheme[];
export const workbenchViewports = ['mobile', 'tablet', 'desktop'] as const;
export const workbenchSfStates = [
  'loading',
  'empty',
  'error',
  'partial',
  'permission-denied',
  'optimistic',
  'success',
  'degraded-network',
  'unsupported-capability',
] as const;

const validProfiles = new Set<UifnQaProfile>([
  'static',
  'control',
  'form',
  'overlay',
  'navigation',
  'feedback',
  'layout',
  'data-rich',
  'typography',
]);

export interface ContractValidationOptions {
  knownSlugs?: Set<string>;
  knownSlugsByFamily?: Partial<Record<UifnContractFamily, Set<string>>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string' && entry.length > 0);
}

export function validateQaContract(contract: unknown, options: ContractValidationOptions = {}): string[] {
  const failures: string[] = [];

  if (!isRecord(contract)) return ['contract must be an object'];

  if (contract.schemaVersion !== 1) failures.push('schemaVersion must be 1');
  if (!['component', 'pattern', 'sf'].includes(String(contract.family))) failures.push(`unknown family ${String(contract.family)}`);
  if (typeof contract.slug !== 'string' || !contract.slug) failures.push('slug is required');
  if (typeof contract.displayName !== 'string' || !contract.displayName) failures.push('displayName is required');
  if (!validProfiles.has(contract.qaProfile as UifnQaProfile)) failures.push(`unknown qaProfile ${String(contract.qaProfile)}`);
  if (!stringArray(contract.qaProfiles)) failures.push('qaProfiles must not be empty');
  for (const profile of stringArray(contract.qaProfiles) ? contract.qaProfiles : []) {
    if (!validProfiles.has(profile as UifnQaProfile)) failures.push(`unknown qaProfiles entry ${profile}`);
  }
  if (stringArray(contract.qaProfiles) && typeof contract.qaProfile === 'string' && !contract.qaProfiles.includes(contract.qaProfile)) {
    failures.push(`qaProfiles must include primary qaProfile ${String(contract.qaProfile)}`);
  }
  if (!stringArray(contract.frameworks) || contract.frameworks.length !== workbenchFrameworks.length) {
    failures.push('all three stable frameworks are required');
  }
  for (const framework of workbenchFrameworks) {
    if (!stringArray(contract.frameworks) || !contract.frameworks.includes(framework)) failures.push(`missing framework ${framework}`);
  }
  for (const field of [
    'requiredRoutes',
    'requiredStates',
    'requiredInteractions',
    'requiredA11y',
    'requiredGeometry',
    'requiredVisual',
    'requiredResponsive',
    'requiredThemes',
    'fixtures',
  ] as const) {
    if (!Array.isArray(contract[field]) || contract[field].length === 0) failures.push(`${field} must not be empty`);
  }
  for (const theme of workbenchThemes) {
    if (!stringArray(contract.requiredThemes) || !contract.requiredThemes.includes(theme)) failures.push(`missing theme ${theme}`);
  }
  for (const route of stringArray(contract.requiredRoutes) ? contract.requiredRoutes : []) {
    if (!route.startsWith('/')) failures.push(`route must start with /: ${route}`);
  }
  const fixtureIds = new Set<string>();
  for (const fixture of Array.isArray(contract.fixtures) ? contract.fixtures : []) {
    if (!isRecord(fixture)) {
      failures.push('fixture must be an object');
      continue;
    }
    if (typeof fixture.id !== 'string' || !fixture.id) {
      failures.push('fixture id is required');
    } else if (fixtureIds.has(fixture.id)) {
      failures.push(`duplicate fixture id ${fixture.id}`);
    } else {
      fixtureIds.add(fixture.id);
    }
    if (typeof fixture.route !== 'string' || !stringArray(contract.requiredRoutes) || !contract.requiredRoutes.includes(fixture.route)) {
      failures.push(`fixture ${String(fixture.id)} references non-required route ${String(fixture.route)}`);
    }
    if (!isRecord(fixture.args)) failures.push(`fixture ${String(fixture.id)} args must be an object`);
    if (!isRecord(fixture.expectedDom) || Object.keys(fixture.expectedDom).length === 0) {
      failures.push(`fixture ${String(fixture.id)} expectedDom must not be empty`);
    }
    if (!isRecord(fixture.expectedBehavior) || Object.keys(fixture.expectedBehavior).length === 0) {
      failures.push(`fixture ${String(fixture.id)} expectedBehavior must not be empty`);
    }
    if (!stringArray(fixture.actions)) failures.push(`fixture ${String(fixture.id)} actions must not be empty`);
    if (!stringArray(fixture.assertions)) failures.push(`fixture ${String(fixture.id)} assertions must not be empty`);
  }
  const family = contract.family as UifnContractFamily;
  const slug = typeof contract.slug === 'string' ? contract.slug : '';
  const knownForFamily = options.knownSlugsByFamily?.[family] ?? options.knownSlugs;
  if (knownForFamily && !knownForFamily.has(slug)) {
    failures.push(`unknown slug ${slug}`);
  }

  return failures;
}

export function assertValidQaContract(contract: unknown, options?: ContractValidationOptions): asserts contract is UifnQaContract {
  const failures = validateQaContract(contract, options);
  if (failures.length) {
    const slug = isRecord(contract) && typeof contract.slug === 'string' ? contract.slug : '(missing slug)';
    throw new Error(`Invalid QA contract for ${slug}: ${failures.join('; ')}`);
  }
}
