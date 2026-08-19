import type {
  ObservabilityInput,
  RequestObservationSnapshot,
  SuperfunctionObservability,
} from "@superfunctions/observability";
import {
  normalizeObservability,
  readObservationGroup,
  roundObservationMs,
} from "@superfunctions/observability";
import type { Middleware } from "./types.js";

export interface ServerTimingOptions {
  totalName?: string;
  groups?: Record<string, string>;
}

export interface ObservationHeaderOptions {
  prefix?: string;
  exposeCounts?: boolean;
  exposeDurations?: boolean;
  groups?: string[];
}

export interface RequestObservabilityMiddlewareOptions<TContext = any> {
  observability?: ObservabilityInput;
  serverTiming?: boolean | ServerTimingOptions;
  headers?: false | ObservationHeaderOptions;
  labels?: Record<string, string>;
  onComplete?: (input: {
    request: Request;
    response: Response;
    context: TContext;
    snapshot: RequestObservationSnapshot;
  }) => void | Promise<void>;
}

export interface RunObservedRequestOptions {
  observability?: ObservabilityInput;
  request: Request;
  labels?: Record<string, string>;
  status?: number | (() => number | undefined);
  responseHeaders?: Headers | (() => Headers | undefined);
  serverTiming?: boolean | ServerTimingOptions;
  headers?: false | ObservationHeaderOptions;
  finishExisting?: boolean;
  work: () => void | Promise<void>;
  onComplete?: (input: {
    request: Request;
    snapshot: RequestObservationSnapshot;
  }) => void | Promise<void>;
}

export async function runObservedRequest(
  options: RunObservedRequestOptions,
): Promise<RequestObservationSnapshot | undefined> {
  const observability = normalizeObservability(options.observability);
  if (!observability) {
    await options.work();
    return undefined;
  }

  const existing = observability.getCurrentRequest();
  const observation = existing ?? observability.startRequest({
    request: options.request,
    labels: options.labels,
  });

  if (existing) {
    await options.work();
  } else {
    await observability.runWithRequest(observation, options.work);
  }

  const status = typeof options.status === "function" ? options.status() : options.status;
  const snapshot = existing && !options.finishExisting
    ? observation.snapshot({ status, labels: options.labels })
    : observation.finish({ status, labels: options.labels });

  const responseHeaders = typeof options.responseHeaders === "function"
    ? options.responseHeaders()
    : options.responseHeaders;
  if (responseHeaders) {
    applyObservationHeaders(responseHeaders, snapshot, {
      serverTiming: options.serverTiming,
      headers: options.headers,
    });
  }

  await options.onComplete?.({
    request: options.request,
    snapshot,
  });

  return snapshot;
}

export function createObservabilityMiddleware<TContext = any>(
  options: RequestObservabilityMiddlewareOptions<TContext>,
): Middleware<TContext> {
  const observability = normalizeObservability(options.observability);

  return async (request, context, next) => {
    if (!observability) {
      return next();
    }

    const existing = observability.getCurrentRequest();
    if (existing) {
      return next();
    }

    const observation = observability.startRequest({
      request,
      labels: options.labels,
    });

    let response = await observability.runWithRequest(observation, next);
    const snapshot = observation.finish({
      status: response.status,
    });
    const headers = new Headers(response.headers);
    applyObservationHeaders(headers, snapshot, {
      serverTiming: options.serverTiming,
      headers: options.headers,
    });
    response = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });

    await options.onComplete?.({
      request,
      response,
      context,
      snapshot,
    });

    return response;
  };
}

export function applyObservationHeaders(
  headers: Headers,
  snapshot: RequestObservationSnapshot,
  options: {
    serverTiming?: boolean | ServerTimingOptions;
    headers?: false | ObservationHeaderOptions;
  } = {},
): void {
  if (options.serverTiming !== false) {
    headers.set(
      "server-timing",
      formatServerTiming(
        snapshot,
        typeof options.serverTiming === "object" ? options.serverTiming : undefined,
      ),
    );
  }

  if (options.headers !== false) {
    applyMetricHeaders(headers, snapshot, options.headers);
  }
}

export function formatServerTiming(
  snapshot: RequestObservationSnapshot,
  options: ServerTimingOptions = {},
): string {
  const totalName = options.totalName ?? "app";
  const groupNames = options.groups ?? {};
  const entries = [`${totalName};dur=${roundObservationMs(snapshot.totalDurationMs)}`];
  const kinds = Array.from(new Set([
    ...Object.keys(snapshot.groups),
    ...Object.keys(groupNames),
  ]));

  for (const kind of kinds) {
    const group = readObservationGroup(snapshot, kind);
    const name = groupNames[kind] ?? kind;
    entries.push(`${name};dur=${roundObservationMs(group.durationMs)}`);
    entries.push(`${name}max;dur=${roundObservationMs(group.maxDurationMs)}`);
    entries.push(`${name}count;desc="${group.count}"`);
  }

  return entries.join(", ");
}

export function applyMetricHeaders(
  headers: Headers,
  snapshot: RequestObservationSnapshot,
  options: ObservationHeaderOptions = {},
): void {
  const prefix = options.prefix ?? "x-superfunctions";
  const exposeCounts = options.exposeCounts ?? true;
  const exposeDurations = options.exposeDurations ?? true;
  const kinds = Array.from(new Set([
    ...Object.keys(snapshot.groups),
    ...(options.groups ?? []),
  ]));

  for (const kind of kinds) {
    const group = readObservationGroup(snapshot, kind);
    if (exposeCounts) {
      headers.set(`${prefix}-${kind}-call-count`, String(group.count));
    }
    if (exposeDurations) {
      headers.set(`${prefix}-${kind}-duration-ms`, String(roundObservationMs(group.durationMs)));
      headers.set(`${prefix}-${kind}-max-duration-ms`, String(roundObservationMs(group.maxDurationMs)));
    }
  }
}

export function resolveObservability(
  input: ObservabilityInput,
): SuperfunctionObservability | undefined {
  return normalizeObservability(input);
}
