import { componentQaContracts, workbenchComponents } from './component-inventory.js';
import { patternQaContracts, workbenchPatterns } from './pattern-inventory.js';
import { primitiveOverlayContracts } from './primitive-overlay-inventory.js';
import { workbenchScenarios } from './scenario-inventory.js';
import { sfQaContracts, workbenchSfPanels } from './sf-inventory.js';
import type { UifnQaContract, UifnWorkbenchFamily, UifnQaProfile } from './qa-contract.js';
import { normalizeCatalogInternalPath } from './catalog-routing.js';

export interface WorkbenchRoute {
  id: string;
  path: string;
  family: UifnWorkbenchFamily | 'index' | 'qa' | 'guide';
  slug?: string;
  title: string;
  contract?: UifnQaContract;
  profile?: UifnQaProfile;
  fixtureId?: string;
}

function routeId(path: string): string {
  return path === '/' ? 'index' : path.slice(1).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function routeMatchesProfile(route: WorkbenchRoute, profile: UifnQaProfile): boolean {
  return (
    route.profile === profile ||
    route.contract?.qaProfiles?.includes(profile) === true ||
    route.contract?.requiredGeometry.includes(profile) === true ||
    route.contract?.requiredInteractions.includes(profile) === true
  );
}

const baseRoutes: WorkbenchRoute[] = [
  { id: 'index', path: '/', family: 'index', title: 'Workbench Home' },
  { id: 'getting-started', path: '/getting-started', family: 'guide', title: 'Getting started' },
  { id: 'components', path: '/components', family: 'component', title: 'Components' },
  { id: 'styling', path: '/styling', family: 'guide', title: 'Styling' },
  { id: 'accessibility', path: '/accessibility', family: 'guide', title: 'Accessibility' },
  { id: 'registry', path: '/registry', family: 'guide', title: 'Registry and source installation' },
  { id: 'scenarios', path: '/scenarios', family: 'scenario', title: 'Product Scenarios' },
  { id: 'patterns', path: '/patterns', family: 'pattern', title: 'Patterns' },
  { id: 'sf', path: '/sf', family: 'sf', title: 'Superfunction Panels' },
  { id: 'qa-all', path: '/qa/all', family: 'qa', title: 'All QA Routes' },
  { id: 'qa-overlays', path: '/qa/overlays', family: 'qa', title: 'Overlay QA Routes', profile: 'overlay' },
  { id: 'qa-forms', path: '/qa/forms', family: 'qa', title: 'Form QA Routes', profile: 'form' },
  { id: 'qa-data-rich', path: '/qa/data-rich', family: 'qa', title: 'Data-rich QA Routes', profile: 'data-rich' },
  { id: 'qa-keyboard', path: '/qa/keyboard', family: 'qa', title: 'Keyboard QA Routes' },
  { id: 'qa-responsive', path: '/qa/responsive', family: 'qa', title: 'Responsive QA Routes' },
  { id: 'qa-themes', path: '/qa/themes', family: 'qa', title: 'Theme QA Routes' },
];

const componentRoutes: WorkbenchRoute[] = componentQaContracts.flatMap((contract) => [
  {
    id: routeId(`/components/${contract.slug}`),
    path: `/components/${contract.slug}`,
    family: 'component',
    slug: contract.slug,
    title: contract.displayName,
    contract,
    profile: contract.qaProfile,
  },
  {
    id: routeId(`/components/${contract.slug}/states`),
    path: `/components/${contract.slug}/states`,
    family: 'component',
    slug: contract.slug,
    title: `${contract.displayName} States`,
    contract,
    profile: contract.qaProfile,
  },
  {
    id: routeId(`/components/${contract.slug}/qa`),
    path: `/components/${contract.slug}/qa`,
    family: 'component',
    slug: contract.slug,
    title: `${contract.displayName} QA`,
    contract,
    profile: contract.qaProfile,
  },
  ...contract.fixtures.map((fixture) => ({
    id: routeId(fixture.route),
    path: fixture.route,
    family: 'component' as const,
    slug: contract.slug,
    title: `${contract.displayName} ${fixture.id}`,
    contract,
    profile: fixture.profile ?? contract.qaProfile,
    fixtureId: fixture.id,
  })),
]);

const primitiveOverlayRoutes: WorkbenchRoute[] = primitiveOverlayContracts.flatMap((contract) => [
  {
    id: routeId(`/components/${contract.slug}`),
    path: `/components/${contract.slug}`,
    family: 'component',
    slug: contract.slug,
    title: contract.displayName,
    contract,
    profile: contract.qaProfile,
  },
  {
    id: routeId(`/components/${contract.slug}/states`),
    path: `/components/${contract.slug}/states`,
    family: 'component',
    slug: contract.slug,
    title: `${contract.displayName} States`,
    contract,
    profile: contract.qaProfile,
  },
  {
    id: routeId(`/components/${contract.slug}/qa`),
    path: `/components/${contract.slug}/qa`,
    family: 'component',
    slug: contract.slug,
    title: `${contract.displayName} QA`,
    contract,
    profile: contract.qaProfile,
  },
  ...contract.fixtures.map((fixture) => ({
    id: routeId(fixture.route),
    path: fixture.route,
    family: 'component' as const,
    slug: contract.slug,
    title: `${contract.displayName} ${fixture.id}`,
    contract,
    profile: fixture.profile ?? contract.qaProfile,
    fixtureId: fixture.id,
  })),
]);

const patternRoutes: WorkbenchRoute[] = patternQaContracts.flatMap((contract) => [
  {
    id: routeId(`/patterns/${contract.slug}`),
    path: `/patterns/${contract.slug}`,
    family: 'pattern',
    slug: contract.slug,
    title: contract.displayName,
    contract,
    profile: contract.qaProfile,
  },
  {
    id: routeId(`/patterns/${contract.slug}/qa`),
    path: `/patterns/${contract.slug}/qa`,
    family: 'pattern',
    slug: contract.slug,
    title: `${contract.displayName} QA`,
    contract,
    profile: contract.qaProfile,
  },
  ...contract.fixtures.map((fixture) => ({
    id: routeId(fixture.route),
    path: fixture.route,
    family: 'pattern' as const,
    slug: contract.slug,
    title: `${contract.displayName} ${fixture.id}`,
    contract,
    profile: fixture.profile ?? contract.qaProfile,
    fixtureId: fixture.id,
  })),
]);

const sfRoutes: WorkbenchRoute[] = sfQaContracts.flatMap((contract) => [
  {
    id: routeId(`/sf/${contract.slug}`),
    path: `/sf/${contract.slug}`,
    family: 'sf',
    slug: contract.slug,
    title: contract.displayName,
    contract,
    profile: contract.qaProfile,
  },
  {
    id: routeId(`/sf/${contract.slug}/qa`),
    path: `/sf/${contract.slug}/qa`,
    family: 'sf',
    slug: contract.slug,
    title: `${contract.displayName} QA`,
    contract,
    profile: contract.qaProfile,
  },
  ...contract.fixtures.map((fixture) => ({
    id: routeId(fixture.route),
    path: fixture.route,
    family: 'sf' as const,
    slug: contract.slug,
    title: `${contract.displayName} ${fixture.id}`,
    contract,
    profile: fixture.profile ?? contract.qaProfile,
    fixtureId: fixture.id,
  })),
]);

const scenarioRoutes: WorkbenchRoute[] = workbenchScenarios.map((scenario) => ({
  id: routeId(`/scenarios/${scenario.slug}`),
  path: `/scenarios/${scenario.slug}`,
  family: 'scenario',
  slug: scenario.slug,
  title: scenario.displayName,
}));

export const workbenchRoutes: WorkbenchRoute[] = [
  ...baseRoutes,
  ...componentRoutes,
  ...primitiveOverlayRoutes,
  ...scenarioRoutes,
  ...patternRoutes,
  ...sfRoutes,
];

export const allQaContracts = [...componentQaContracts, ...primitiveOverlayContracts, ...patternQaContracts, ...sfQaContracts];

export function getWorkbenchRoute(path: string): WorkbenchRoute {
  const normalized = normalizeCatalogInternalPath(path);
  return workbenchRoutes.find((route) => route.path === normalized) ?? baseRoutes[0];
}

export function getRoutesByFamily(family: UifnWorkbenchFamily): WorkbenchRoute[] {
  return workbenchRoutes.filter((route) => route.family === family);
}

export function getQaRoutesByProfile(profile: UifnQaProfile): WorkbenchRoute[] {
  return workbenchRoutes.filter((route) => routeMatchesProfile(route, profile));
}

export const workbenchCounts = {
  frameworks: 3,
  components: workbenchComponents.length,
  scenarios: workbenchScenarios.length,
  patterns: workbenchPatterns.length,
  sfPanels: workbenchSfPanels.length,
  routes: workbenchRoutes.length,
};
