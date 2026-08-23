import assert from 'node:assert/strict';
import test from 'node:test';
import {
  phase14BrowserCellDefinition,
  phase14RenderingEmulation,
  probePhase14BrowserProduct,
  validatePhase14BrowserDriver,
  validatePhase14BrowserPayload,
} from './run-uifn-phase-14-browser-cell.mjs';

const vectors = Array.from({ length: 69 }, (_, index) => ({ id: `vector-${index}`, primitive: `Primitive${index}` }));

function payload(framework, profile) {
  return {
    status: 'passed',
    framework,
    profile: profile ?? null,
    publicTreeCount: 69,
    warningCount: 0,
    errorCount: 0,
    traces: vectors.map((vector) => ({ ...vector, vectorId: vector.id, framework, installMode: 'package', result: 'passed' })),
    ...(profile ? { rendering: { profile, passed: true } } : {}),
  };
}

test('accepts exact installed Chrome and Edge product probes without confusing generic Chromium', () => {
  const chrome = phase14BrowserCellDefinition('chrome-latest');
  assert.equal(probePhase14BrowserProduct(chrome, 'Google Chrome 150.0.7871.129').version, '150.0.7871.129');
  assert.throws(() => probePhase14BrowserProduct(chrome, 'Chromium 150.0.0.0'), /did not identify/);
  const edge = phase14BrowserCellDefinition('edge-latest');
  assert.equal(probePhase14BrowserProduct(edge, 'Microsoft Edge 150.0.100.1').product, 'Microsoft Edge');
  assert.throws(() => probePhase14BrowserProduct(edge, 'Google Chrome 150.0.100.1'), /did not identify/);
});

test('rejects Playwright substitution for Safari and all physical-device cells', () => {
  assert.throws(() => validatePhase14BrowserDriver(phase14BrowserCellDefinition('safari-current'), 'playwright-product'), /real Safari WebDriver/);
  assert.throws(() => validatePhase14BrowserDriver(phase14BrowserCellDefinition('ios-safari-current'), 'playwright-product'), /physical device-lab/);
  assert.equal(validatePhase14BrowserDriver(phase14BrowserCellDefinition('safari-current'), 'webdriver'), true);
});

test('maps each rendering profile to an observable browser precondition', () => {
  assert.deepEqual(phase14RenderingEmulation('forced-colors'), { media: { forcedColors: 'active' } });
  assert.deepEqual(phase14RenderingEmulation('reduced-motion'), { media: { reducedMotion: 'reduce' } });
  assert.deepEqual(phase14RenderingEmulation('zoom-400'), { pageScaleFactor: 4 });
  assert.throws(() => phase14RenderingEmulation('invented-profile'), /Unknown rendering profile/);
});

test('accepts the complete unique packed public-tree manifest and rejects incomplete or profile-free payloads', () => {
  assert.equal(validatePhase14BrowserPayload({ payload: payload('react'), framework: 'react', vectors }), true);
  const incomplete = payload('svelte');
  incomplete.traces.pop();
  assert.throws(() => validatePhase14BrowserPayload({ payload: incomplete, framework: 'svelte', vectors }), /invalid or duplicate|covered|incomplete/);
  assert.throws(() => validatePhase14BrowserPayload({ payload: payload('solid'), framework: 'solid', profile: 'rtl', vectors }), /did not prove rendering profile/);
});
