import fs from 'node:fs/promises';
import path from 'node:path';

import { createExtfnError, type ExtfnError } from '../errors.js';
import type {
  BrowserTarget,
  ContentScriptConfig,
  ResolvedContentScriptConfig,
} from '../types.js';
import { SUPPORTED_BROWSER_TARGETS } from '../types.js';

const CONTENT_SCRIPT_MARKER = Symbol.for('superfunctions.extfn.content-script');
const ALLOWED_STYLE_ISOLATION = new Set(['inherit', 'root-scoped', 'shadow-root']);

export function defineContentScript<TConfig extends ContentScriptConfig>(
  config: TConfig
): TConfig {
  return Object.defineProperty(config, CONTENT_SCRIPT_MARKER, {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  });
}

export async function validateContentScripts(
  contentScripts: readonly ContentScriptConfig[] | undefined,
  configDir: string,
  extensionTargets?: readonly BrowserTarget[]
): Promise<readonly ResolvedContentScriptConfig[]> {
  if (!contentScripts || contentScripts.length === 0) {
    return [];
  }

  const resolvedScripts: ResolvedContentScriptConfig[] = [];
  const seenIds = new Set<string>();

  for (const contentScript of contentScripts) {
    validateContentScriptShape(contentScript, extensionTargets);

    if (seenIds.has(contentScript.id)) {
      throw createExtfnError(
        'E_CONFIG_INVALID',
        `Duplicate content script id: ${contentScript.id}`,
        { id: contentScript.id }
      );
    }
    seenIds.add(contentScript.id);

    const resolvedEntry = path.resolve(configDir, contentScript.entry);
    await assertFileExists(
      resolvedEntry,
      createExtfnError(
        'E_ENTRY_NOT_FOUND',
        `Missing content entry: ${contentScript.entry}`,
        { id: contentScript.id, entry: contentScript.entry }
      )
    );

    const resolvedCss: string[] = [];
    for (const cssPath of contentScript.css ?? []) {
      const resolvedCssPath = path.resolve(configDir, cssPath);
      await assertFileExists(
        resolvedCssPath,
        createExtfnError(
          'E_ENTRY_NOT_FOUND',
          `Missing content style: ${cssPath}`,
          { id: contentScript.id, entry: cssPath }
        )
      );
      resolvedCss.push(resolvedCssPath);
    }

    resolvedScripts.push({
      ...contentScript,
      resolvedEntry,
      resolvedCss,
    });
  }

  return resolvedScripts;
}

export function validateContentScriptShape(
  contentScript: ContentScriptConfig,
  extensionTargets?: readonly BrowserTarget[]
): ContentScriptConfig {
  if (typeof contentScript.id !== 'string' || contentScript.id.trim() === '') {
    throw createExtfnError(
      'E_CONFIG_INVALID',
      'Content script id must be a non-empty string.'
    );
  }

  if (typeof contentScript.entry !== 'string' || contentScript.entry.trim() === '') {
    throw createExtfnError(
      'E_CONFIG_INVALID',
      `Content script ${contentScript.id} must include a non-empty entry.`
    );
  }

  if (!Array.isArray(contentScript.matches) || contentScript.matches.length === 0) {
    throw createExtfnError(
      'E_CONFIG_INVALID',
      `Content script ${contentScript.id} must include at least one match pattern.`
    );
  }

  if (
    contentScript.styleIsolation !== undefined &&
    !ALLOWED_STYLE_ISOLATION.has(contentScript.styleIsolation)
  ) {
    throw createExtfnError(
      'E_CONFIG_INVALID',
      `Unsupported styleIsolation mode: ${contentScript.styleIsolation}`,
      { id: contentScript.id, styleIsolation: contentScript.styleIsolation }
    );
  }

  if (contentScript.targets !== undefined) {
    if (!Array.isArray(contentScript.targets) || contentScript.targets.length === 0) {
      throw createExtfnError(
        'E_CONFIG_INVALID',
        `Content script ${contentScript.id} targets must contain at least one browser target.`
      );
    }

    const extensionTargetSet = extensionTargets
      ? new Set<BrowserTarget>(extensionTargets)
      : undefined;

    for (const target of contentScript.targets) {
      if (!SUPPORTED_BROWSER_TARGETS.includes(target)) {
        throw createExtfnError(
          'E_CONFIG_INVALID',
          `Content script ${contentScript.id} contains unsupported target: ${target}`,
          { id: contentScript.id, target }
        );
      }

      if (extensionTargetSet && !extensionTargetSet.has(target)) {
        throw createExtfnError(
          'E_CONFIG_INVALID',
          `Content script ${contentScript.id} target is not listed in extension.targets: ${target}`,
          { id: contentScript.id, target }
        );
      }
    }
  }

  return contentScript;
}

async function assertFileExists(filePath: string, error: ExtfnError): Promise<void> {
  try {
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) {
      throw error;
    }
  } catch {
    throw error;
  }
}
