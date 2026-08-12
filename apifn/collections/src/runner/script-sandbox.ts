import vm from "node:vm";
import { randomUUID } from "node:crypto";
import type { AssertionResult, CookieJar } from "../types.js";
import { createAssertionRuntime } from "./assertions.js";

export const SCRIPT_TIMEOUT_MS = 10_000;

type EnvStore = Record<string, string>;

export interface ScriptRequestContext {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

export interface ScriptResponseContext {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  responseTime: number;
}

interface BaseScriptOptions {
  code: string;
  env: EnvStore;
  req: ScriptRequestContext;
  cookies?: CookieJar;
  timeoutMs?: number;
}

export interface ExecutePreRequestScriptOptions extends BaseScriptOptions {}

export interface ExecuteTestScriptOptions extends BaseScriptOptions {
  res: ScriptResponseContext;
  assertionResults: AssertionResult[];
}

export interface ScriptExecutionError {
  message: string;
}

function createEnvProxy(env: EnvStore): EnvStore & {
  get(name: string): string | undefined;
  set(name: string, value: unknown): void;
  unset(name: string): void;
  delete(name: string): void;
  all(): EnvStore;
} {
  const helper = {
    get(name: string): string | undefined {
      return env[name];
    },
    set(name: string, value: unknown): void {
      env[name] = String(value);
    },
    unset(name: string): void {
      delete env[name];
    },
    delete(name: string): void {
      delete env[name];
    },
    all(): EnvStore {
      return { ...env };
    },
  };

  return new Proxy(helper as EnvStore & typeof helper, {
    get(target, prop, receiver) {
      if (typeof prop === "string" && prop in env) {
        return env[prop];
      }
      return Reflect.get(target, prop, receiver);
    },
    set(target, prop, value, receiver) {
      if (typeof prop === "string" && !(prop in target)) {
        env[prop] = String(value);
        return true;
      }
      return Reflect.set(target, prop, value, receiver);
    },
    ownKeys(target) {
      return [...new Set([...Reflect.ownKeys(target), ...Object.keys(env)])];
    },
    has(target, prop) {
      if (typeof prop === "string" && prop in env) {
        return true;
      }
      return Reflect.has(target, prop);
    },
    getOwnPropertyDescriptor(target, prop) {
      if (typeof prop === "string" && prop in env) {
        return {
          configurable: true,
          enumerable: true,
          writable: true,
          value: env[prop],
        };
      }
      return Reflect.getOwnPropertyDescriptor(target, prop);
    },
  });
}

function sanitizeError(error: unknown): ScriptExecutionError {
  if (error instanceof Error) {
    return { message: error.message };
  }
  return { message: String(error) };
}

async function runInSandbox(
  code: string,
  contextValues: Record<string, unknown>,
  timeoutMs: number
): Promise<void> {
  const context = vm.createContext(
    {
      ...contextValues,
      console: {
        debug: console.debug.bind(console),
        error: console.error.bind(console),
        info: console.info.bind(console),
        log: console.log.bind(console),
        warn: console.warn.bind(console),
      },
      URL,
      URLSearchParams,
      crypto: {
        randomUUID,
      },
      btoa(value: string): string {
        return Buffer.from(value, "utf8").toString("base64");
      },
      atob(value: string): string {
        return Buffer.from(value, "base64").toString("utf8");
      },
      process: undefined,
      require: undefined,
      module: undefined,
      global: undefined,
      globalThis: undefined,
      fetch: undefined,
      Function: undefined,
      eval: undefined,
      setTimeout: undefined,
      setInterval: undefined,
      setImmediate: undefined,
      clearTimeout: undefined,
      clearInterval: undefined,
      clearImmediate: undefined,
    },
    {
      codeGeneration: {
        strings: false,
        wasm: false,
      },
    }
  );

  const wrappedCode = `"use strict"; (async () => { ${code}\n })()`;
  const script = new vm.Script(wrappedCode, {
    filename: "collection-script.js",
  });
  let timeout: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      script.runInContext(context, { timeout: timeoutMs }) as Promise<unknown>,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`Script execution timed out after ${timeoutMs}ms`)),
          timeoutMs
        );
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function normalizeScriptError(error: ScriptExecutionError, kind: "pre-request" | "tests"): ScriptExecutionError {
  return {
    message: kind === "pre-request"
      ? `Pre-request script failed: ${error.message}`
      : `Test script failed: ${error.message}`,
  };
}

export async function executePreRequestScript(
  options: ExecutePreRequestScriptOptions
): Promise<{ error?: ScriptExecutionError }> {
  const env = createEnvProxy(options.env);

  try {
    await runInSandbox(
      options.code,
      {
        req: options.req,
        env,
        cookies: options.cookies,
      },
      options.timeoutMs ?? SCRIPT_TIMEOUT_MS
    );
    return {};
  } catch (error) {
    return {
      error: normalizeScriptError(sanitizeError(error), "pre-request"),
    };
  }
}

export async function executeTestScript(
  options: ExecuteTestScriptOptions
): Promise<{ error?: ScriptExecutionError }> {
  const env = createEnvProxy(options.env);
  const assertionRuntime = createAssertionRuntime();
  const res = {
    ...options.res,
    json() {
      return options.res.body;
    },
  };

  try {
    await runInSandbox(
      options.code,
      {
        req: options.req,
        res,
        env,
        cookies: options.cookies,
        expect: assertionRuntime.expect,
        test: assertionRuntime.test,
      },
      options.timeoutMs ?? SCRIPT_TIMEOUT_MS
    );
  } catch (error) {
    options.assertionResults.push({
      name: "script execution",
      passed: false,
      error: normalizeScriptError(sanitizeError(error), "tests").message,
    });
    return {
      error: normalizeScriptError(sanitizeError(error), "tests"),
    };
  }

  options.assertionResults.push(...assertionRuntime.getResults());
  return {};
}
