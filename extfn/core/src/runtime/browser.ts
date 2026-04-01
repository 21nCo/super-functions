import { createExtfnError } from '../errors.js';
import type { BrowserTarget } from '../types.js';
import {
  assertPayloadWithinLimit,
  assertSupportedBrowserMethodPath,
  getBrowserCapabilities,
  type BrowserCapabilities,
} from './capabilities.js';

export interface BrowserFacade {
  raw: unknown;
  capabilities: BrowserCapabilities;
  call<T = unknown>(path: string, ...args: unknown[]): Promise<T>;
  namespace<T extends object = Record<string, unknown>>(path: string): T;
}

export interface CreateBrowserFacadeOptions {
  raw: unknown;
  target: BrowserTarget;
}

export function createBrowserFacade(
  options: CreateBrowserFacadeOptions
): BrowserFacade {
  const capabilities = getBrowserCapabilities(options.target);
  const rawRoot = asRecord(options.raw);

  return {
    raw: options.raw,
    capabilities,
    async call<T>(path: string, ...args: unknown[]): Promise<T> {
      assertSupportedBrowserMethodPath(options.target, path);
      assertPayloadWithinLimit(args);

      const resolved = resolvePath(rawRoot, path);
      if (typeof resolved.value !== 'function') {
        throw createExtfnError(
          'E_CONTEXT_UNAVAILABLE',
          `Browser method path is unavailable in the current context: ${path}`,
          { path }
        );
      }

      return await invokeBrowserMethod<T>(
        resolved.owner,
        resolved.value as (...callArgs: unknown[]) => unknown,
        args,
        options.raw
      );
    },
    namespace<T extends object = Record<string, unknown>>(path: string): T {
      assertSupportedBrowserMethodPath(options.target, path);

      const resolved = resolvePath(rawRoot, path);
      if (!resolved.value || typeof resolved.value !== 'object') {
        throw createExtfnError(
          'E_CONTEXT_UNAVAILABLE',
          `Browser method path is unavailable in the current context: ${path}`,
          { path }
        );
      }

      return createNamespaceProxy(path, options) as T;
    },
  };
}

async function invokeBrowserMethod<T>(
  owner: unknown,
  method: (...callArgs: unknown[]) => unknown,
  args: readonly unknown[],
  rawRoot: unknown
): Promise<T> {
  const callbackExpected = method.length > args.length;

  if (!callbackExpected) {
    const result = method.apply(owner, [...args]);
    if (isPromiseLike(result)) {
      return (await result) as T;
    }
    return result as T;
  }

  return await new Promise<T>((resolve, reject) => {
    const callback = (...callbackArgs: unknown[]) => {
      const lastError = readLastError(rawRoot);
      if (lastError) {
        reject(
          createExtfnError(
            'E_CONTEXT_UNAVAILABLE',
            lastError,
            { callbackArgs }
          )
        );
        return;
      }

      if (callbackArgs.length <= 1) {
        resolve(callbackArgs[0] as T);
        return;
      }

      resolve(callbackArgs as T);
    };

    try {
      const maybeResult = method.apply(owner, [...args, callback]);
      if (isPromiseLike(maybeResult)) {
        void maybeResult.then(resolve as (value: unknown) => void, reject);
      } else if (maybeResult !== undefined) {
        resolve(maybeResult as T);
      }
    } catch (error) {
      reject(error);
    }
  });
}

function createNamespaceProxy(
  namespacePath: string,
  options: CreateBrowserFacadeOptions
): object {
  return new Proxy(
    {},
    {
      get(_target, property) {
        if (property === 'then') {
          return undefined;
        }

        if (typeof property !== 'string') {
          return undefined;
        }

        const nextPath = `${namespacePath}.${property}`;
        assertSupportedBrowserMethodPath(options.target, nextPath);
        const resolved = resolvePath(asRecord(options.raw), nextPath);

        if (typeof resolved.value === 'function') {
          return (...args: unknown[]) =>
            createBrowserFacade(options).call(nextPath, ...args);
        }

        if (resolved.value && typeof resolved.value === 'object') {
          return createNamespaceProxy(nextPath, options);
        }

        if (resolved.value === undefined) {
          throw createExtfnError(
            'E_CONTEXT_UNAVAILABLE',
            `Browser method path is unavailable in the current context: ${nextPath}`,
            { path: nextPath }
          );
        }

        return resolved.value;
      },
    }
  );
}

function resolvePath(
  root: Record<string, unknown>,
  path: string
): { owner: unknown; value: unknown } {
  const segments = path.split('.').filter(Boolean);
  let owner: unknown = root;
  let current: unknown = root;

  for (const segment of segments) {
    owner = current;
    current = asRecord(current)[segment];
  }

  return { owner, value: current };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null) {
    return value as Record<string, unknown>;
  }

  return {};
}

function isPromiseLike(value: unknown): value is Promise<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Promise<unknown>).then === 'function'
  );
}

function readLastError(rawRoot: unknown): string | null {
  const runtime = asRecord(rawRoot).runtime;
  const lastError = asRecord(runtime).lastError;
  if (lastError && typeof asRecord(lastError).message === 'string') {
    return asRecord(lastError).message as string;
  }

  return null;
}
