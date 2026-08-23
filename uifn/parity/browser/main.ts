import { configureRenderingProfile, inspectRenderingProfile } from './profile';

declare global {
  interface Window {
    __UIFN_PHASE14_BROWSER_RESULT__?: Record<string, unknown>;
  }
}

const parameters = new URLSearchParams(location.search);
const framework = parameters.get('framework');
const profile = parameters.get('profile') ?? undefined;
const warnings: string[] = [];
const errors: string[] = [];
const serialize = (value: unknown) => value instanceof Error ? `${value.name}: ${value.message}` : String(value);
const originalWarn = console.warn;
const originalError = console.error;
console.warn = (...values: unknown[]) => { warnings.push(values.map(serialize).join(' ')); originalWarn(...values); };
console.error = (...values: unknown[]) => { errors.push(values.map(serialize).join(' ')); originalError(...values); };
addEventListener('error', (event) => errors.push(serialize(event.error ?? event.message)));
addEventListener('unhandledrejection', (event) => errors.push(serialize(event.reason)));
window.__UIFN_PHASE14_BROWSER_RESULT__ = { status: 'pending', framework, profile };

try {
  configureRenderingProfile(profile);
  const runner = framework === 'react' ? await import('./react')
    : framework === 'svelte' ? await import('./svelte')
    : framework === 'solid' ? await import('./solid')
    : undefined;
  if (!runner) throw new Error(`Unknown Phase 14 browser framework ${framework ?? '<missing>'}.`);
  const traces = await runner.runBrowserPublicTrees();
  const rendering = inspectRenderingProfile(profile);
  if (warnings.length > 0 || errors.length > 0) {
    throw new Error(`Real-browser execution emitted ${warnings.length} warning(s) and ${errors.length} error(s).`);
  }
  window.__UIFN_PHASE14_BROWSER_RESULT__ = {
    status: 'passed',
    framework,
    profile: profile ?? null,
    publicTreeCount: traces.length,
    traces,
    rendering,
    warningCount: warnings.length,
    errorCount: errors.length,
  };
} catch (cause) {
  window.__UIFN_PHASE14_BROWSER_RESULT__ = {
    status: 'failed',
    framework,
    profile: profile ?? null,
    message: serialize(cause),
    stack: cause instanceof Error ? cause.stack : undefined,
    warnings,
    errors,
    warningCount: warnings.length,
    errorCount: errors.length,
  };
}
