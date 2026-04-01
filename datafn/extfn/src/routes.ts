import type {
  BackgroundHandlerDefinition,
} from "@superfunctions/extfn";
import type { DatafnSchema } from "@datafn/core";
import type { DatafnExtfnAuthority } from "./authority.js";
import {
  createExtfnLikeError,
  toProxyId,
} from "./shared.js";

const DATAFN_ROUTE_METHODS = [
  "query",
  "mutation",
  "transact",
  "seed",
  "clone",
  "pull",
  "push",
  "reconcile",
  "subscribe",
  "unsubscribe",
] as const;

export function createDatafnExtfnRoutes<S extends DatafnSchema>(
  authority: DatafnExtfnAuthority<S>,
): readonly BackgroundHandlerDefinition[] {
  return DATAFN_ROUTE_METHODS.map((method) => ({
    namespace: "datafn",
    method,
    handle: async (...args: unknown[]) => {
      const payload = args[1];
      const envelope = args[2] as
        | { source?: Parameters<typeof toProxyId>[0] }
        | undefined;
      const proxyId = envelope?.source
        ? toProxyId(envelope.source)
        : "datafn-route";

      if (method === "subscribe") {
        throw createExtfnLikeError(
          "E_CONTEXT_UNAVAILABLE",
          "DataFn subscription routes require a live proxy bridge for event fanout.",
          { proxyId },
        );
      }

      return authority.requestMethod(method, payload, {
        proxyId,
      });
    },
  }));
}
