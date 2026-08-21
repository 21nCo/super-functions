import { getSuperConsole, loadSuperConsoleInstallation } from './installation.js';

export async function bootConfiguredSuperConsole(specifier?: string): Promise<void> {
  if (getSuperConsole()) return;
  if (!specifier?.trim()) return;
  // Installation import and composition validation are startup-fatal by design.
  await loadSuperConsoleInstallation(specifier);
}

export async function handleConfiguredSuperConsole(request: Request): Promise<Response> {
  const console = getSuperConsole();
  if (!console) {
    return new Response(JSON.stringify({
      ok: false,
      error: {
        code: 'SUPERCONSOLE_NOT_CONFIGURED',
        message: 'Super Console has not been composed for this server process.',
        status: 503,
      },
    }), {
      status: 503,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
  return console.handle(request);
}
