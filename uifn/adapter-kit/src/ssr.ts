import { createUIFnError } from '@uifn/core/errors';

export interface SSRGuard {
  isBrowser: () => boolean;
  assertClient: (feature: string) => void;
  runClient: <T>(feature: string, callback: () => T, fallback: T) => T;
}

export function createSSRGuard(options: { canUseDOM?: () => boolean } = {}): SSRGuard {
  const canUseDOM =
    options.canUseDOM ??
    (() => typeof globalThis !== 'undefined' && 'document' in globalThis);

  const assertClient = (feature: string): void => {
    if (canUseDOM()) return;
    throw createUIFnError({
      code: 'UIFN_ERR_UNSUPPORTED_ENVIRONMENT',
      package: '@uifn/adapter-kit',
      component: 'SSRGuard',
      message: 'Adapter feature requires a client environment.',
      details: { feature },
    });
  };

  return {
    isBrowser() {
      return canUseDOM();
    },
    assertClient,
    runClient(feature, callback, fallback) {
      if (!canUseDOM()) {
        return fallback;
      }

      assertClient(feature);
      return callback();
    },
  };
}
