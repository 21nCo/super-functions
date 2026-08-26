import { describe, expect, it } from 'vitest';
import {
  componentQaContracts,
  expectedComponentSlugs,
  workbenchComponents,
  workbenchComponentSlugs,
} from '../component-inventory.js';
import { patternQaContracts, workbenchPatterns } from '../pattern-inventory.js';
import { primitiveOverlayContracts } from '../primitive-overlay-inventory.js';
import { sfQaContracts, workbenchSfPanels } from '../sf-inventory.js';
import { allQaContracts, getQaRoutesByProfile, workbenchRoutes } from '../routes.js';
import { sanitizeEvidenceValue, validateBrowserQaResult } from '../reporting.js';
import { validateQaContract, workbenchFrameworks, workbenchThemes } from '../qa-contract.js';

describe('Workbench QA contracts', () => {
  it('covers the full component inventory in deterministic registry order', () => {
    expect(workbenchComponents).toHaveLength(69);
    expect(workbenchComponentSlugs).toEqual([...expectedComponentSlugs]);
    expect(new Set(workbenchComponentSlugs).size).toBe(69);
  });

  it('covers all controlled patterns and Superfunction-backed panels', () => {
    expect(workbenchPatterns).toHaveLength(14);
    expect(workbenchSfPanels).toHaveLength(14);
    expect(patternQaContracts).toHaveLength(14);
    expect(sfQaContracts).toHaveLength(14);
  });

  it('validates every contract against required fields, frameworks, routes, and themes', () => {
    const knownSlugsByFamily = {
      component: new Set([...componentQaContracts, ...primitiveOverlayContracts].map((contract) => contract.slug)),
      pattern: new Set(patternQaContracts.map((contract) => contract.slug)),
      sf: new Set(sfQaContracts.map((contract) => contract.slug)),
    };

    for (const contract of allQaContracts) {
      expect(validateQaContract(contract, { knownSlugsByFamily })).toEqual([]);
      expect(contract.frameworks).toEqual([...workbenchFrameworks]);
      expect(contract.requiredThemes).toEqual([...workbenchThemes]);
      expect(contract.fixtures.length).toBeGreaterThan(0);
      expect(contract.qaProfiles).toContain(contract.qaProfile);
      expect(contract.fixtures.every((fixture) => fixture.actions.length > 0 && fixture.assertions.length > 0)).toBe(true);
    }
  });

  it('rejects malformed contracts and unknown slugs', () => {
    const contract = { ...componentQaContracts[0], slug: 'missing-component', requiredRoutes: [] };
    expect(validateQaContract(contract, { knownSlugs: new Set(workbenchComponentSlugs) })).toEqual(
      expect.arrayContaining(['requiredRoutes must not be empty', 'unknown slug missing-component'])
    );
  });

  it('returns canonical validation failures for missing fields instead of throwing a TypeError', () => {
    expect(validateQaContract({
      schemaVersion: 1,
      family: 'component',
      slug: 'button',
      qaProfile: 'control',
    })).toEqual(expect.arrayContaining([
      'displayName is required',
      'all three stable frameworks are required',
      'requiredRoutes must not be empty',
      'fixtures must not be empty',
    ]));
  });

  it('validates result envelopes and recursively sanitizes evidence', () => {
    const result = {
      ok: false,
      command: 'verify:uifn-browser',
      schemaVersion: 1,
      frameworkCount: 1,
      componentCount: 69,
      patternCount: 14,
      sfPanelCount: 14,
      routeCount: 1,
      checks: [{
        id: 'react:/components/button/qa/default',
        family: 'component',
        slug: 'button',
        framework: 'react',
        route: '/components/button/qa/default',
        status: 'failed',
        evidence: {},
      }],
      failures: [{
        code: 'UIFN_QA_TEST',
        message: 'failed',
        qaCaseId: 'default',
        assertionType: 'interaction',
        evidence: {},
      }],
    };
    expect(validateBrowserQaResult(result)).toEqual([]);
    expect(validateBrowserQaResult({ ...result, failures: undefined })).toContain('failures array is required');
    expect(sanitizeEvidenceValue({
      nested: {
        message: `user demo@example.invalid opened /${'Users'}/demo/private.txt`,
        accessToken: 'unsafe',
      },
    })).toEqual({
      nested: {
        message: 'user [REDACTED_PII] opened [REDACTED_LOCAL_PATH]',
        accessToken: '[REDACTED]',
      },
    });
  });

  it('generates deterministic route IDs for every required route', () => {
    const routePaths = new Set(workbenchRoutes.map((route) => route.path));
    for (const contract of allQaContracts) {
      for (const route of contract.requiredRoutes) {
        expect(routePaths.has(route)).toBe(true);
      }
    }
  });

  it('keeps every multi-profile component visible in each profile-specific route set', () => {
    for (const component of workbenchComponents) {
      for (const profile of component.profiles) {
        const profileRoutes = getQaRoutesByProfile(profile).filter((route) => route.slug === component.slug);
        expect(
          profileRoutes.length,
          `${component.slug} must appear in ${profile} route coverage`
        ).toBeGreaterThan(0);
      }
    }

    expect(getQaRoutesByProfile('overlay').some((route) => route.slug === 'select')).toBe(true);
    expect(getQaRoutesByProfile('layout').some((route) => route.slug === 'splitter')).toBe(true);
    expect(getQaRoutesByProfile('navigation').some((route) => route.slug === 'tree-view')).toBe(true);
    expect(getQaRoutesByProfile('overlay').some((route) => route.slug === 'menubar')).toBe(true);
  });
});
