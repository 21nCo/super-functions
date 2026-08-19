import type { MiddlewareHandler } from "hono";
import type {
  ObservabilityInput,
  RequestObservationSnapshot,
} from "@superfunctions/observability";
import { normalizeObservability } from "@superfunctions/observability";
import {
  applyObservationHeaders,
  type ObservationHeaderOptions,
  type ServerTimingOptions,
} from "@superfunctions/http";

export interface HonoObservabilityMiddlewareOptions {
  observability?: ObservabilityInput;
  serverTiming?: boolean | ServerTimingOptions;
  headers?: false | ObservationHeaderOptions;
  labels?: Record<string, string>;
  onComplete?: (input: {
    request: Request;
    response: Response;
    snapshot: RequestObservationSnapshot;
  }) => void | Promise<void>;
}

export function observabilityMiddleware(
  options: HonoObservabilityMiddlewareOptions,
): MiddlewareHandler {
  const observability = normalizeObservability(options.observability);

  return async (c, next) => {
    if (!observability) {
      await next();
      return;
    }

    const existing = observability.getCurrentRequest();
    if (existing) {
      await next();
      return;
    }

    const observation = observability.startRequest({
      request: c.req.raw,
      labels: options.labels,
    });

    await observability.runWithRequest(observation, next);
    const snapshot = observation.finish({
      status: c.res.status,
    });
    applyObservationHeaders(c.res.headers, snapshot, {
      serverTiming: options.serverTiming,
      headers: options.headers,
    });
    await options.onComplete?.({
      request: c.req.raw,
      response: c.res,
      snapshot,
    });
  };
}
