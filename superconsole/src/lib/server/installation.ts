import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { SuperConsole } from './super-console.js';

const INSTALLATION = Symbol.for('superfunctions.superconsole.installation.v1');
const LOADER = Symbol.for('superfunctions.superconsole.installation-loader.v1');

type InstallationGlobal = typeof globalThis & { [INSTALLATION]?: SuperConsole; [LOADER]?: Promise<SuperConsole> };

/** Configure one process-local, explicitly composed self-hosted installation. */
export function configureSuperConsole(console: SuperConsole): SuperConsole {
  if ((globalThis as InstallationGlobal)[INSTALLATION]) {
    throw new Error('Super Console is already configured for this process. Refusing to replace the active installation.');
  }
  (globalThis as InstallationGlobal)[INSTALLATION] = console;
  return console;
}

export function getSuperConsole(): SuperConsole | undefined {
  return (globalThis as InstallationGlobal)[INSTALLATION];
}

export function requireSuperConsole(): SuperConsole {
  const console = getSuperConsole();
  if (!console) {
    throw new Error('Super Console is not configured. Call configureSuperConsole(createSuperConsole(...)) during server startup.');
  }
  return console;
}

export function clearSuperConsoleForTesting(): void {
  delete (globalThis as InstallationGlobal)[INSTALLATION];
  delete (globalThis as InstallationGlobal)[LOADER];
}

/** Resolve only local installation modules; package/http/data URLs are rejected. */
export function resolveSuperConsoleInstallationUrl(specifier: string): string {
  const normalized = specifier.trim();
  if (!normalized) throw new Error('SUPERCONSOLE_INSTALLATION must not be empty.');
  if (normalized.slice(0, 'file://'.length).toLowerCase() === 'file://') {
    try {
      const url = new URL(normalized);
      if (url.protocol !== 'file:') throw new Error();
      return url.href;
    } catch {
      throw new Error('SUPERCONSOLE_INSTALLATION contains an invalid file URL.');
    }
  }
  if (!isAbsolute(normalized)) {
    throw new Error('SUPERCONSOLE_INSTALLATION must be an absolute filesystem path or file URL.');
  }
  return pathToFileURL(normalized).href;
}

/**
 * Load an explicitly configured installation module once. The module must be an
 * absolute file URL/path permitted by the server deployment and export either
 * `superConsole`, `default`, or `createSuperConsoleInstallation`.
 */
export async function loadSuperConsoleInstallation(specifier: string): Promise<SuperConsole> {
  const globals = globalThis as InstallationGlobal;
  if (globals[INSTALLATION]) return globals[INSTALLATION];
  globals[LOADER] ??= (async () => {
    const importUrl = resolveSuperConsoleInstallationUrl(specifier);
    const module = await import(/* @vite-ignore */ importUrl) as {
      default?: SuperConsole;
      superConsole?: SuperConsole;
      createSuperConsoleInstallation?: () => SuperConsole | Promise<SuperConsole>;
    };
    const candidate = module.createSuperConsoleInstallation
      ? await module.createSuperConsoleInstallation()
      : module.superConsole ?? module.default;
    if (!candidate || typeof candidate.handle !== 'function') {
      throw new Error('The Super Console installation module did not export a composed SuperConsole instance.');
    }
    return configureSuperConsole(candidate);
  })();
  return globals[LOADER];
}
