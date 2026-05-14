import os from 'node:os';
import path from 'node:path';

import type { BrowserTarget } from '@superfunctions/extfn';
import type { ExecService } from '@clifn/core/exec';

export interface OpenBrowserOptions {
  exec: ExecService;
  extensionPath: string;
  target: BrowserTarget;
  browser?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export interface OpenBrowserResult {
  launched: boolean;
  command?: string;
  args?: readonly string[];
  reason?: string;
}

const CHROMIUM_CANDIDATES = [
  'google-chrome',
  'chromium',
  'chromium-browser',
  'brave-browser',
  'microsoft-edge',
];

const FIREFOX_CANDIDATES = ['firefox'];

export async function openBrowserSession(
  options: OpenBrowserOptions
): Promise<OpenBrowserResult> {
  const requestedBrowser =
    options.browser ?? options.env?.EXTFN_BROWSER ?? options.env?.BROWSER;

  if (options.target === 'firefox-mv3') {
    const browser = requestedBrowser ?? FIREFOX_CANDIDATES[0];
    const args =
      process.platform === 'darwin'
        ? ['-na', browser, '--args', 'about:debugging#/runtime/this-firefox']
        : ['about:debugging#/runtime/this-firefox'];

    await options.exec.command(process.platform === 'darwin' ? 'open' : browser, args, {
      cwd: options.cwd,
      env: options.env,
      timeoutMs: 10_000,
    });

    return {
      launched: true,
      command: browser,
      args,
      reason:
        'Firefox development sessions require manual loading from about:debugging.',
    };
  }

  const browser = requestedBrowser ?? CHROMIUM_CANDIDATES[0];
  const profileDir = path.join(
    os.tmpdir(),
    `extfn-${options.target}-${process.pid}`
  );
  const args = [
    ...(process.platform === 'darwin' ? ['-na', browser, '--args'] : []),
    `--load-extension=${options.extensionPath}`,
    `--disable-extensions-except=${options.extensionPath}`,
    `--user-data-dir=${profileDir}`,
    'about:blank',
  ];

  await options.exec.command(process.platform === 'darwin' ? 'open' : browser, args, {
    cwd: options.cwd,
    env: options.env,
    timeoutMs: 10_000,
  });

  return {
    launched: true,
    command: browser,
    args,
  };
}
