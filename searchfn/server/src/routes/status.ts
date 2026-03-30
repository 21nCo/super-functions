import type { SearchAdapter } from "@searchfn/adapter-contracts";
import { okResponse, errorResponse } from "../http/errors.js";
import type { ServerContext } from "../server.js";

export interface ServerHealthSnapshot {
  state: "ok" | "degraded";
  degradedSince?: number;
  failureCount: number;
}

export function statusHandler(
  adapter: SearchAdapter,
  startTime: number,
  getHealth: () => ServerHealthSnapshot,
) {
  return async (_req: Request, _ctx: ServerContext): Promise<Response> => {
    try {
      const health = getHealth();
      return okResponse({
        adapter: adapter.name,
        capabilities: adapter.capabilities ?? {},
        uptimeMs: Date.now() - startTime,
        state: health.state,
        degradedSince: health.degradedSince,
        failureCount: health.failureCount,
      });
    } catch (err) {
      return errorResponse("INTERNAL", "Status check failed");
    }
  };
}
