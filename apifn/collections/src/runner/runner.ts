import type {
  Collection,
  CollectionItem,
  CookieJar,
  Environment,
  HttpClient,
  OpenCollectionRequest,
  RequestResult,
  RunOptions,
  RunReporter,
  RunReport,
} from "../types.js";
import { buildRunReport } from "../report.js";
import { createCookieJar, createFetchHttpClient } from "./http-client.js";
import { interpolateVariables, resolveVariableContext } from "../variables.js";
import {
  executePreRequestScript,
  executeTestScript,
  type ScriptRequestContext,
  type ScriptResponseContext,
} from "./script-sandbox.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_CAPTURED_BODY_BYTES = 10 * 1024 * 1024;
const DEFAULT_REDACT_HEADERS = [
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "x-auth-token",
];
const DEFAULT_REDACT_BODY_KEYS = [
  "apiKey",
  "api_key",
  "authorization",
  "bearer",
  "code",
  "handoffCode",
  "otp",
  "password",
  "refreshToken",
  "sessionToken",
  "token",
];

interface RequestEntry {
  item: CollectionItem;
  request: OpenCollectionRequest;
}

function sortItems(items: CollectionItem[]): CollectionItem[] {
  return [...items].sort((a, b) => {
    const aSeq = a.seq ?? Number.MAX_SAFE_INTEGER;
    const bSeq = b.seq ?? Number.MAX_SAFE_INTEGER;
    if (aSeq !== bSeq) {
      return aSeq - bSeq;
    }
    return a.name.localeCompare(b.name);
  });
}

function flattenRequestItems(items: CollectionItem[]): RequestEntry[] {
  const output: RequestEntry[] = [];

  function walk(nodes: CollectionItem[]): void {
    for (const node of sortItems(nodes)) {
      if (node.kind === "request" && node.request) {
        output.push({ item: node, request: node.request });
      }

      if (node.kind === "folder" && node.children) {
        walk(node.children);
      }
    }
  }

  walk(items);
  return output;
}

function getEnvironment(collection: Collection, env: string | Environment): Environment {
  if (typeof env !== "string") {
    return env;
  }

  const matched = collection.environments[env];
  if (!matched) {
    throw new Error(`Environment '${env}' not found`);
  }
  return matched;
}

function redactHeaders(headers: Record<string, string>, redactList: string[]): Record<string, string> {
  const redactSet = new Set(redactList.map((header) => header.toLowerCase()));
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    result[key] = redactSet.has(key.toLowerCase()) ? "[REDACTED]" : value;
  }
  return result;
}

function redactBody(body: string | undefined): string | undefined {
  if (body === undefined) {
    return undefined;
  }

  try {
    return JSON.stringify(redactJsonValue(JSON.parse(body) as unknown), null, 2);
  } catch {
    return DEFAULT_REDACT_BODY_KEYS.reduce((value, key) => {
      const pattern = new RegExp(`(${key}=)([^&\\s]+)`, "gi");
      return value.replace(pattern, `$1[REDACTED]`);
    }, body);
  }
}

function redactJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => redactJsonValue(entry));
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (DEFAULT_REDACT_BODY_KEYS.some((name) => name.toLowerCase() === key.toLowerCase())) {
      result[key] = "[REDACTED]";
    } else {
      result[key] = redactJsonValue(item);
    }
  }
  return result;
}

function interpolateRequest(
  request: OpenCollectionRequest,
  context: Record<string, string>,
  processEnv: NodeJS.ProcessEnv
): {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  warnings: string[];
} {
  const warnings: string[] = [];

  const urlInterpolated = interpolateVariables(request.http.url, context, { processEnv });
  warnings.push(...urlInterpolated.warnings);

  const headers: Record<string, string> = {};
  for (const header of request.http.headers ?? []) {
    const interpolated = interpolateVariables(header.value, context, { processEnv });
    warnings.push(...interpolated.warnings);
    headers[header.name] = interpolated.value;
  }

  let body: string | undefined;
  if (request.http.body?.data !== undefined) {
    const bodyInterpolated = interpolateVariables(request.http.body.data, context, {
      processEnv,
    });
    warnings.push(...bodyInterpolated.warnings);
    body = bodyInterpolated.value;
  }

  let url = urlInterpolated.value;
  const queryParams = request.http.params?.query ?? [];
  if (queryParams.length > 0) {
    const parsedUrl = new URL(urlInterpolated.value);
    for (const query of queryParams) {
      if (query.enabled === false) {
        continue;
      }
      const interpolated = interpolateVariables(query.value, context, { processEnv });
      warnings.push(...interpolated.warnings);
      parsedUrl.searchParams.set(query.name, interpolated.value);
    }
    url = parsedUrl.toString();
  }

  return {
    method: request.http.method,
    url,
    headers,
    body,
    warnings,
  };
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;

  return new Promise<T>((resolve, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`Request timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((value) => resolve(value))
      .catch((error) => reject(error))
      .finally(() => {
        if (timeout) {
          clearTimeout(timeout);
        }
      });
  });
}

function truncateBody(body: string): string {
  const size = Buffer.byteLength(body, "utf8");
  if (size <= MAX_CAPTURED_BODY_BYTES) {
    return body;
  }

  let low = 0;
  let high = body.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (Buffer.byteLength(body.slice(0, mid), "utf8") <= MAX_CAPTURED_BODY_BYTES) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  return body.slice(0, low);
}

async function executeRequest(
  entry: RequestEntry,
  options: {
    collection: Collection;
    context: Record<string, string>;
    processEnv: NodeJS.ProcessEnv;
    timeout: number;
    retries: number;
    httpClient: HttpClient;
    cookieJar?: CookieJar;
    redactHeaders: string[];
    reporter?: RunReporter;
    isolateContext?: boolean;
  }
): Promise<RequestResult> {
  options.reporter?.onRequestStart?.(entry.item);

  const requestContext = options.isolateContext ? { ...options.context } : options.context;
  const interpolated = interpolateRequest(entry.request, requestContext, options.processEnv);
  const mutableRequest: ScriptRequestContext = {
    method: interpolated.method,
    url: interpolated.url,
    headers: { ...interpolated.headers },
    body: interpolated.body,
  };
  const assertionResults: RequestResult["assertions"] = [];
  const scripts = entry.request.runtime?.scripts ?? [];

  for (const script of scripts) {
    if (script.type !== "pre-request") {
      continue;
    }

    const preRequestResult = await executePreRequestScript({
      code: script.code,
      req: mutableRequest,
      env: requestContext,
      cookies: options.cookieJar,
    });

    if (preRequestResult.error) {
      const result: RequestResult = {
        name: entry.request.info.name,
        path: entry.item.path,
        method: mutableRequest.method,
        url: mutableRequest.url,
        status: "error",
        duration: 0,
        assertions: [],
        warnings: interpolated.warnings.length ? interpolated.warnings : undefined,
        error: preRequestResult.error.message,
        request: {
          method: mutableRequest.method,
          url: mutableRequest.url,
          headers: redactHeaders(mutableRequest.headers, options.redactHeaders),
          body: redactBody(mutableRequest.body),
        },
      };
      options.reporter?.onRequestComplete?.(result);
      return result;
    }
  }

  const attempts: NonNullable<RequestResult["attempts"]> = [];
  let lastError: string | undefined;

  for (let attempt = 0; attempt <= options.retries; attempt += 1) {
    const attemptNumber = attempt + 1;
    const startedAt = Date.now();

    try {
      const response = await withTimeout(
        options.httpClient.send({
          method: mutableRequest.method,
          url: mutableRequest.url,
          headers: mutableRequest.headers,
          body: mutableRequest.body,
          timeout: options.timeout,
          followRedirects: entry.request.settings?.followRedirects,
          maxRedirects: entry.request.settings?.maxRedirects,
        }),
        options.timeout
      );

      attempts.push({
        attempt: attemptNumber,
        statusCode: response.status,
        duration: response.duration,
      });

      if (response.status >= 500 && attempt < options.retries) {
        continue;
      }

      const parsedResponseBody = (() => {
        try {
          return JSON.parse(response.body);
        } catch {
          return response.body;
        }
      })();
      const responseForScripts: ScriptResponseContext = {
        status: response.status,
        headers: response.headers,
        body: parsedResponseBody,
        responseTime: response.duration,
      };

      for (const script of scripts) {
        if (script.type !== "tests" && script.type !== "post-response") {
          continue;
        }

        const testResult = await executeTestScript({
          code: script.code,
          req: mutableRequest,
          res: responseForScripts,
          env: requestContext,
          cookies: options.cookieJar,
          assertionResults,
        });

        if (testResult.error) {
          break;
        }
      }

      const hasFailedAssertions = assertionResults.some((assertion) => !assertion.passed);
      const hasExpectedStatus = statusMatchesExpected(response.status, entry.request.settings?.expectedStatus);
      const status: RequestResult["status"] =
        !hasExpectedStatus || hasFailedAssertions ? "failed" : "passed";
      const result: RequestResult = {
        name: entry.request.info.name,
        path: entry.item.path,
        method: mutableRequest.method,
        url: mutableRequest.url,
        status,
        statusCode: response.status,
        duration: Date.now() - startedAt,
        assertions: assertionResults,
        warnings: interpolated.warnings.length ? interpolated.warnings : undefined,
        attempts,
        request: {
          method: mutableRequest.method,
          url: mutableRequest.url,
          headers: redactHeaders(mutableRequest.headers, options.redactHeaders),
          body: redactBody(mutableRequest.body),
        },
        response: {
          status: response.status,
          headers: redactHeaders(response.headers, options.redactHeaders),
          body: redactBody(truncateBody(response.body)) ?? "",
          size: response.size,
          redirects: response.redirects,
        },
      };

      options.reporter?.onRequestComplete?.(result);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lastError = message;
      attempts.push({
        attempt: attemptNumber,
        duration: Date.now() - startedAt,
        error: message,
      });

      if (attempt < options.retries) {
        continue;
      }
    }
  }

  const result: RequestResult = {
    name: entry.request.info.name,
    path: entry.item.path,
    method: mutableRequest.method,
    url: mutableRequest.url,
    status: "error",
    duration: attempts[attempts.length - 1]?.duration ?? 0,
    assertions: assertionResults,
    warnings: interpolated.warnings.length ? interpolated.warnings : undefined,
    attempts,
    error: lastError ?? "Request failed",
    request: {
      method: mutableRequest.method,
      url: mutableRequest.url,
      headers: redactHeaders(mutableRequest.headers, options.redactHeaders),
      body: redactBody(mutableRequest.body),
    },
  };

  options.reporter?.onRequestComplete?.(result);
  return result;
}

function skippedResult(entry: RequestEntry): RequestResult {
  return {
    name: entry.request.info.name,
    path: entry.item.path,
    method: entry.request.http.method,
    url: entry.request.http.url,
    status: "skipped",
    duration: 0,
    assertions: [],
    request: {
      method: entry.request.http.method,
      url: entry.request.http.url,
      headers: {},
    },
  };
}

function patternMatches(value: string, pattern: string): boolean {
  if (pattern === value) {
    return true;
  }

  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i").test(value);
}

function shouldRunEntry(entry: RequestEntry, options: Pick<RunOptions, "include" | "exclude">): boolean {
  const candidates = [
    entry.item.path,
    entry.item.name,
    entry.request.info.name,
    `${entry.request.http.method.toUpperCase()} ${entry.request.http.url}`,
  ];

  const included =
    !options.include ||
    options.include.length === 0 ||
    options.include.some((pattern) =>
      candidates.some((candidate) => patternMatches(candidate, pattern))
    );
  if (!included) {
    return false;
  }

  return !(options.exclude ?? []).some((pattern) =>
    candidates.some((candidate) => patternMatches(candidate, pattern))
  );
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function statusMatchesExpected(status: number, expected: number | number[] | undefined): boolean {
  if (expected === undefined) {
    return status < 400;
  }
  return Array.isArray(expected) ? expected.includes(status) : status === expected;
}

export async function runCollection(
  collection: Collection,
  options: RunOptions
): Promise<RunReport> {
  const startedAt = new Date();
  const environment = getEnvironment(collection, options.environment);
  const processEnv = process.env;
  const collectionVariables =
    (collection as unknown as { variables?: Record<string, string> }).variables ?? {};
  const context = resolveVariableContext({
    overrides: options.overrides,
    environment: environment.variables,
    collection: collectionVariables,
    processEnv,
  });

  const entries = flattenRequestItems(collection.items);
  const reporter = options.reporter;
  reporter?.onStart?.(collection, options);

  const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? 0;
  const cookieJar = options.cookieJar ?? createCookieJar();
  const httpClient = options.httpClient ?? createFetchHttpClient({ cookieJar });
  const redactList = [...DEFAULT_REDACT_HEADERS, ...(options.redactHeaders ?? [])];

  const results: Array<RequestResult | undefined> = new Array(entries.length);
  let bailTriggered = false;

  if (options.parallel) {
    const concurrency = Math.max(1, options.concurrency ?? 4);
    let pointer = 0;

    async function worker(): Promise<void> {
      while (pointer < entries.length) {
        const index = pointer;
        pointer += 1;

        if (options.bail && bailTriggered) {
          continue;
        }

        const entry = entries[index];
        if (!shouldRunEntry(entry, options)) {
          const skipped = skippedResult(entry);
          results[index] = skipped;
          reporter?.onRequestComplete?.(skipped);
          continue;
        }

        const result = await executeRequest(entry, {
          collection,
          context,
          processEnv,
          timeout: entry.request.settings?.timeout ?? timeout,
          retries,
          httpClient,
          cookieJar,
          redactHeaders: redactList,
          reporter,
          isolateContext: true,
        });

        results[index] = result;
        if (options.bail && (result.status === "failed" || result.status === "error")) {
          bailTriggered = true;
        }
      }
    }

    await Promise.all(Array.from({ length: concurrency }, () => worker()));
  } else {
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];

      if (options.bail && bailTriggered) {
        results[index] = skippedResult(entry);
        continue;
      }

      if (!shouldRunEntry(entry, options)) {
        const skipped = skippedResult(entry);
        results[index] = skipped;
        reporter?.onRequestComplete?.(skipped);
        continue;
      }

      const result = await executeRequest(entry, {
        collection,
        context,
        processEnv,
        timeout: entry.request.settings?.timeout ?? timeout,
        retries,
        httpClient,
        cookieJar,
        redactHeaders: redactList,
        reporter,
      });

      results[index] = result;

      if (options.bail && (result.status === "failed" || result.status === "error")) {
        bailTriggered = true;
      }

      if (options.delay && index < entries.length - 1) {
        await sleep(options.delay);
      }
    }
  }

  for (let index = 0; index < entries.length; index += 1) {
    if (!results[index]) {
      const skipped = skippedResult(entries[index]);
      results[index] = skipped;
      reporter?.onRequestComplete?.(skipped);
    }
  }

  const completedAt = new Date();
  const report = buildRunReport({
    collectionName: collection.info.name,
    environment: environment.name,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    results: results as RequestResult[],
  });

  reporter?.onComplete?.(report);
  return report;
}
