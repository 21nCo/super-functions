import type { UIFnEnvironment } from '@uifn/core/environment';
import {
  createUIFnInputModality,
  type UIFnInputModalityService,
} from './focusable';
import {
  createUIFnFocusScopeManager,
  type UIFnFocusScopeManager,
} from './focus-scope';
import {
  createUIFnDismissableLayerStack,
  type UIFnDismissableLayerStack,
} from './layers';
import { createUIFnLiveRegion, type UIFnLiveRegion } from './live-region';
import { createUIFnModalManager, type UIFnModalManager } from './modal';
import {
  createUIFnDomScope,
  type UIFnDomRoot,
  type UIFnDomScope,
} from './scope';

export interface UIFnDomPlatform {
  readonly scope: UIFnDomScope;
  readonly modality: UIFnInputModalityService;
  readonly layers: UIFnDismissableLayerStack;
  readonly focusScopes: UIFnFocusScopeManager;
  readonly modals: UIFnModalManager;
  readonly liveRegion: UIFnLiveRegion;
  destroy(): void;
}

export interface CreateUIFnDomPlatformOptions {
  readonly root: UIFnDomRoot;
  readonly environment?: UIFnEnvironment;
}

export interface UIFnSharedDomPlatform {
  readonly platform: UIFnDomPlatform;
  release(): void;
}

interface SharedRecord {
  readonly platform: UIFnDomPlatform;
  references: number;
}

const sharedPlatforms = new WeakMap<object, SharedRecord>();

export function createUIFnDomPlatform(options: CreateUIFnDomPlatformOptions): UIFnDomPlatform {
  const scope = createUIFnDomScope(options);
  let modality: UIFnInputModalityService | null = null;
  let layers: UIFnDismissableLayerStack | null = null;
  let focusScopes: UIFnFocusScopeManager | null = null;
  let modals: UIFnModalManager | null = null;
  let liveRegion: UIFnLiveRegion | null = null;
  let destroyed = false;

  const platform: UIFnDomPlatform = {
    scope,
    get modality() {
      scope.assertAlive('access modality service');
      return modality ??= createUIFnInputModality(scope);
    },
    get layers() {
      scope.assertAlive('access dismissable layer stack');
      return layers ??= createUIFnDismissableLayerStack(scope);
    },
    get focusScopes() {
      scope.assertAlive('access focus scope manager');
      return focusScopes ??= createUIFnFocusScopeManager(scope);
    },
    get modals() {
      scope.assertAlive('access modal manager');
      return modals ??= createUIFnModalManager(scope);
    },
    get liveRegion() {
      scope.assertAlive('access live region');
      return liveRegion ??= createUIFnLiveRegion(scope);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      liveRegion?.destroy();
      modals?.destroy();
      focusScopes?.destroy();
      layers?.destroy();
      modality?.destroy();
      scope.destroy();
    },
  };
  return platform;
}

export function acquireUIFnDomPlatform(
  options: CreateUIFnDomPlatformOptions,
): UIFnSharedDomPlatform {
  const key = options.root as object;
  let record = sharedPlatforms.get(key);
  if (!record || record.platform.scope.destroyed) {
    record = { platform: createUIFnDomPlatform(options), references: 0 };
    sharedPlatforms.set(key, record);
  }
  record.references += 1;
  let active = true;
  return {
    platform: record.platform,
    release() {
      if (!active) return;
      active = false;
      record!.references = Math.max(0, record!.references - 1);
      if (record!.references > 0) return;
      sharedPlatforms.delete(key);
      record!.platform.destroy();
    },
  };
}
