import { createExtfnError } from '../errors.js';
import type { BrowserTarget } from '../types.js';

export type RuntimeContextKind =
  | 'background'
  | 'popup'
  | 'options'
  | 'sidepanel'
  | 'content';

export interface RuntimeAddress {
  context: RuntimeContextKind;
  surfaceId?: string;
  contentScriptId?: string;
  tabId?: number;
  frameId?: number;
}

export interface RuntimeContextMetadata extends Partial<RuntimeAddress> {
  target?: BrowserTarget;
}

export interface RuntimeDetectionGlobals {
  browser?: unknown;
  chrome?: unknown;
  location?: {
    protocol?: string;
    pathname?: string;
  };
  document?: unknown;
  window?: unknown;
  __EXTFN_RUNTIME_CONTEXT__?: RuntimeContextMetadata;
  __EXTFN_CONTENT_SCRIPT_ID__?: string;
  __EXTFN_TAB_ID__?: number;
  __EXTFN_FRAME_ID__?: number;
}

export function resolveRuntimeAddress(
  globals: RuntimeDetectionGlobals = globalThis as RuntimeDetectionGlobals
): RuntimeAddress {
  const metadata = globals.__EXTFN_RUNTIME_CONTEXT__;

  if (metadata?.context) {
    return normalizeRuntimeAddress(metadata);
  }

  const locationProtocol = globals.location?.protocol ?? '';
  const pathname = globals.location?.pathname ?? '';

  if (!locationProtocol && !globals.document) {
    throw createExtfnError(
      'E_CONTEXT_UNAVAILABLE',
      'Runtime context could not be resolved.'
    );
  }

  if (isExtensionProtocol(locationProtocol)) {
    if (pathnameIncludes(pathname, 'popup')) {
      return {
        context: 'popup',
        surfaceId: 'popup',
      };
    }

    if (pathnameIncludes(pathname, 'options')) {
      return {
        context: 'options',
        surfaceId: 'options',
      };
    }

    if (pathnameIncludes(pathname, 'sidepanel') || pathnameIncludes(pathname, 'side-panel')) {
      return {
        context: 'sidepanel',
        surfaceId: 'sidepanel',
      };
    }

    return {
      context: 'background',
      surfaceId: 'background',
    };
  }

  if (globals.document) {
    const contentScriptId = globals.__EXTFN_CONTENT_SCRIPT_ID__;
    if (!contentScriptId) {
      throw createExtfnError(
        'E_CONTEXT_UNAVAILABLE',
        'Runtime context could not be resolved.'
      );
    }

    return {
      context: 'content',
      contentScriptId,
      tabId: globals.__EXTFN_TAB_ID__,
      frameId: globals.__EXTFN_FRAME_ID__,
    };
  }

  throw createExtfnError(
    'E_CONTEXT_UNAVAILABLE',
    'Runtime context could not be resolved.'
  );
}

export function detectBrowserTarget(
  globals: RuntimeDetectionGlobals = globalThis as RuntimeDetectionGlobals
): BrowserTarget {
  const metadataTarget = globals.__EXTFN_RUNTIME_CONTEXT__?.target;
  if (metadataTarget) {
    return metadataTarget;
  }

  const protocol = globals.location?.protocol ?? '';
  if (protocol === 'moz-extension:') {
    return 'firefox-mv3';
  }

  if (protocol === 'chrome-extension:') {
    return 'chromium-mv3';
  }

  if (globals.browser && !globals.chrome) {
    return 'firefox-mv3';
  }

  return 'chromium-mv3';
}

function normalizeRuntimeAddress(metadata: RuntimeContextMetadata): RuntimeAddress {
  if (!metadata.context) {
    throw createExtfnError(
      'E_CONTEXT_UNAVAILABLE',
      'Runtime context could not be resolved.'
    );
  }

  const address: RuntimeAddress = {
    context: metadata.context,
  };

  if (metadata.surfaceId) {
    address.surfaceId = metadata.surfaceId;
  } else if (metadata.context !== 'content') {
    address.surfaceId = metadata.context;
  }

  if (metadata.context === 'content') {
    if (!metadata.contentScriptId) {
      throw createExtfnError(
        'E_CONTEXT_UNAVAILABLE',
        'Runtime context could not be resolved.'
      );
    }

    address.contentScriptId = metadata.contentScriptId;
    if (typeof metadata.tabId === 'number') {
      address.tabId = metadata.tabId;
    }
    if (typeof metadata.frameId === 'number') {
      address.frameId = metadata.frameId;
    }
  }

  return address;
}

function isExtensionProtocol(protocol: string): boolean {
  return protocol === 'chrome-extension:' || protocol === 'moz-extension:';
}

function pathnameIncludes(pathname: string, token: string): boolean {
  return pathname.toLowerCase().includes(token.toLowerCase());
}
