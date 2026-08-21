/** Browser capability substrate consumed by framework-native hook bindings. */
export interface MediaQueryChangeLike {
  matches: boolean;
}

export interface MediaQueryListLike {
  readonly matches: boolean;
  addEventListener?: (type: 'change', listener: (event: MediaQueryChangeLike) => void) => void;
  removeEventListener?: (type: 'change', listener: (event: MediaQueryChangeLike) => void) => void;
  addListener?: (listener: (event: MediaQueryChangeLike) => void) => void;
  removeListener?: (listener: (event: MediaQueryChangeLike) => void) => void;
}

export interface ClipboardLike {
  writeText: (text: string) => Promise<void> | void;
}

export interface HookEnvironment {
  matchMedia?: (query: string) => MediaQueryListLike;
  clipboard?: ClipboardLike | null;
}

export interface MediaQueryOptions {
  defaultValue?: boolean;
  environment?: HookEnvironment | null;
}

export interface CopyToClipboardOptions {
  environment?: HookEnvironment | null;
}

export interface MediaQuerySubscription {
  value: boolean;
  unsubscribe: () => void;
}

export type CopyToClipboardErrorCode = 'clipboard-unavailable' | 'clipboard-write-failed';

export interface CopyToClipboardError {
  code: CopyToClipboardErrorCode;
  message: string;
  cause?: unknown;
}

export type CopyToClipboardResult =
  | {
      ok: true;
      text: string;
      error: null;
    }
  | {
      ok: false;
      text: string;
      error: CopyToClipboardError;
    };

function getGlobalHookEnvironment(): HookEnvironment {
  const root = globalThis as unknown as {
    matchMedia?: (query: string) => MediaQueryListLike;
    navigator?: {
      clipboard?: ClipboardLike | null;
    };
  };

  return {
    matchMedia: typeof root.matchMedia === 'function' ? root.matchMedia.bind(root) : undefined,
    clipboard: root.navigator?.clipboard ?? null,
  };
}

function resolveHookEnvironment(environment?: HookEnvironment | null): HookEnvironment {
  return environment ?? getGlobalHookEnvironment();
}

export function getMediaQuerySnapshot(query: string, options: MediaQueryOptions = {}): boolean {
  const environment = resolveHookEnvironment(options.environment);
  if (!environment.matchMedia) {
    return options.defaultValue ?? false;
  }

  return environment.matchMedia(query).matches;
}

export function subscribeMediaQuery(
  query: string,
  onChange: (matches: boolean) => void,
  options: MediaQueryOptions = {}
): MediaQuerySubscription {
  const environment = resolveHookEnvironment(options.environment);

  if (!environment.matchMedia) {
    return {
      value: options.defaultValue ?? false,
      unsubscribe: () => undefined,
    };
  }

  const queryList = environment.matchMedia(query);
  let active = true;

  const listener = (event: MediaQueryChangeLike) => {
    if (!active) {
      return;
    }

    onChange(event.matches);
  };

  if (queryList.addEventListener) {
    queryList.addEventListener('change', listener);
  } else {
    queryList.addListener?.(listener);
  }

  return {
    value: queryList.matches,
    unsubscribe() {
      if (!active) {
        return;
      }

      active = false;
      if (queryList.removeEventListener) {
        queryList.removeEventListener('change', listener);
      } else {
        queryList.removeListener?.(listener);
      }
    },
  };
}

export async function copyTextToClipboard(
  text: string,
  options: CopyToClipboardOptions = {}
): Promise<CopyToClipboardResult> {
  const environment = resolveHookEnvironment(options.environment);

  if (!environment.clipboard?.writeText) {
    return {
      ok: false,
      text,
      error: {
        code: 'clipboard-unavailable',
        message: 'Clipboard writeText is not available in this environment.',
      },
    };
  }

  try {
    await environment.clipboard.writeText(text);
    return {
      ok: true,
      text,
      error: null,
    };
  } catch (cause) {
    return {
      ok: false,
      text,
      error: {
        code: 'clipboard-write-failed',
        message: 'Clipboard writeText rejected the copy request.',
        cause,
      },
    };
  }
}
