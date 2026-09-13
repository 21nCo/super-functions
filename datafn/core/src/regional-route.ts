/** Public, provider-neutral direct regional transport contract. Times are Unix milliseconds. */
export const DATAFN_ROUTE_TICKET_HEADER = "x-datafn-route-ticket";
export const DATAFN_ROUTE_WS_PROTOCOL = "datafn-sync-v1";
export const DATAFN_ROUTE_WS_TICKET_PREFIX = "datafn-ticket.";
export const DATAFN_ROUTE_EXPIRED_CLOSE_CODE = 4511;
export const DATAFN_ROUTE_DENIED_CLOSE_CODE = 4403;
export const DATAFN_ROUTE_MAX_TTL_MS = 300_000;

export type DatafnRouteScope =
  | "query" | "search" | "mutation" | "transact" | "seed" | "clone"
  | "pull" | "push" | "reconcile" | "custom" | "websocket";

export interface DatafnRegionalRouteDescriptor {
  version: 1;
  httpUrl: string;
  wsUrl?: string;
  ticket: string;
  expiresAt: number;
  renewAfter: number;
}

/** Implement both operations against the canonical authenticated bootstrap authority. */
export interface DatafnRouteProvider {
  bootstrap(): Promise<DatafnRegionalRouteDescriptor>;
  renew(): Promise<DatafnRegionalRouteDescriptor>;
}

/** Reject credential-bearing, insecure, or ambiguous endpoint URLs. */
export function validateDatafnRegionalEndpoint(value: string, websocket = false): string {
  const url = new URL(value);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const protocol = websocket ? "wss:" : "https:";
  const localProtocol = websocket ? "ws:" : "http:";
  if ((url.protocol !== protocol && !(local && url.protocol === localProtocol)) ||
    url.username || url.password || value.includes("?") || value.includes("#")) {
    throw new Error("DATAFN_ROUTE_ENDPOINT_INVALID");
  }
  return url.toString().replace(/\/$/, "");
}
