import path from 'node:path';

import {
  ExtfnError,
  type BrowserTarget,
  type ResolvedContentScriptConfig,
  type ResolvedExtensionConfig,
  type ResolvedPageSurface,
  type RuntimeContextKind,
} from '@extfn/core';

export type ExtfnReloadStrategy = 'hmr' | 'reinject' | 'full-reload';

export interface ExtfnReloadPolicyOptions {
  pageHmr?: boolean;
  contentReinject?: boolean;
}

export interface ExtfnReloadDecision {
  surface: RuntimeContextKind | 'unknown';
  strategy: ExtfnReloadStrategy;
  target: BrowserTarget;
  changedFile: string;
  reason: string;
}

export function decideReloadStrategy(
  input: {
    surface: RuntimeContextKind | 'unknown';
    changedFile: string;
    target: BrowserTarget;
  },
  options: ExtfnReloadPolicyOptions = {}
): ExtfnReloadDecision {
  const pageHmr = options.pageHmr ?? true;
  const contentReinject = options.contentReinject ?? true;

  switch (input.surface) {
    case 'popup':
    case 'options':
    case 'sidepanel':
      return {
        ...input,
        strategy: pageHmr ? 'hmr' : 'full-reload',
        reason: pageHmr
          ? `${input.surface} page supports HMR`
          : `${input.surface} page requires full reload`,
      };
    case 'content':
      if (!contentReinject) {
        return {
          ...input,
          strategy: 'full-reload',
          reason: 'content surface does not declare safe reinjection',
        };
      }
      return {
        ...input,
        strategy: 'reinject',
        reason: 'content surface uses reinjection-safe update path',
      };
    case 'background':
      return {
        ...input,
        strategy: 'full-reload',
        reason: 'background changes require extension reload',
      };
    default:
      return {
        ...input,
        strategy: 'full-reload',
        reason: 'changed file is not mapped to a safe HMR surface',
      };
  }
}

export function assertSafeReloadDecision(decision: ExtfnReloadDecision): void {
  if (decision.surface === 'content' && decision.strategy === 'hmr') {
    throw new ExtfnError(
      'E_CONFIG_INVALID',
      'Unsafe HMR strategy selected for content surface.',
      {
        details: {
          changedFile: decision.changedFile,
          reason: decision.reason,
          strategy: decision.strategy,
          surface: decision.surface,
          target: decision.target,
        },
      }
    );
  }
}

export function detectChangedSurface(
  resolvedConfig: ResolvedExtensionConfig,
  changedFile: string
): RuntimeContextKind | 'unknown' {
  const normalizedChangedFile = normalizeFilePath(changedFile);

  if (
    normalizedChangedFile === normalizeFilePath(
      resolvedConfig.background.resolvedServiceWorker
    ) ||
    isNestedWithin(
      normalizedChangedFile,
      resolvedConfig.background.resolvedMessageHandlersDir
    ) ||
    isNestedWithin(
      normalizedChangedFile,
      resolvedConfig.background.resolvedPortHandlersDir
    )
  ) {
    return 'background';
  }

  const contentMatch = resolvedConfig.contentScripts.some((contentScript) =>
    matchesContentScriptFile(contentScript, normalizedChangedFile)
  );
  if (contentMatch) {
    return 'content';
  }

  for (const surface of resolvedConfig.surfaces) {
    if (normalizedChangedFile === normalizeFilePath(surface.resolvedEntry)) {
      return surface.surface;
    }
  }

  return 'unknown';
}

export function formatReloadDecisionLog(
  decision: ExtfnReloadDecision
): Record<string, string> {
  return {
    changedFile: decision.changedFile,
    reason: decision.reason,
    strategy: decision.strategy,
    surface: decision.surface,
    target: decision.target,
  };
}

function matchesContentScriptFile(
  contentScript: ResolvedContentScriptConfig,
  normalizedChangedFile: string
): boolean {
  if (normalizedChangedFile === normalizeFilePath(contentScript.resolvedEntry)) {
    return true;
  }

  return contentScript.resolvedCss.some(
    (cssPath) => normalizedChangedFile === normalizeFilePath(cssPath)
  );
}

function isNestedWithin(
  candidateFile: string,
  maybeDirectory: string | undefined
): boolean {
  if (!maybeDirectory) {
    return false;
  }

  const normalizedDirectory = normalizeFilePath(maybeDirectory);
  if (!normalizedDirectory) {
    return false;
  }

  const relativePath = path.relative(normalizedDirectory, candidateFile);
  return (
    relativePath !== '' &&
    !relativePath.startsWith('..') &&
    !path.isAbsolute(relativePath)
  );
}

function normalizeFilePath(filePath: string): string {
  return path.resolve(filePath);
}
