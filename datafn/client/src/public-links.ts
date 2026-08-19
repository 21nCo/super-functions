import type { DatafnRemoteAdapter } from "./client.js";
import { createClientError } from "./errors.js";
import { createDatafnPublicLinkAuthPlugin } from "./auth.js";

type DatafnPublicLinksRemoteAdapter = DatafnRemoteAdapter & {
  publicLinks?(endpoint: string, payload: unknown): Promise<unknown>;
};

export type DatafnPublicLinkShareLevel = "viewer" | "editor" | "owner";
export type DatafnPublicLinkShareScope = "record" | "resource";

export interface CreateDatafnPublicLinkInput {
  resource: string;
  recordId?: string | null;
  scope: DatafnPublicLinkShareScope;
  level: DatafnPublicLinkShareLevel;
  expiresAt?: number | string | null;
}

export interface DatafnPublicLinkGrant {
  id: string;
  token: string;
  principalId: string;
  resource: string;
  recordId: string | null;
  scope: DatafnPublicLinkShareScope;
  level: DatafnPublicLinkShareLevel;
}

export interface DatafnResolvedPublicLink {
  principalId: string;
  resource: string;
  recordId: string | null;
  scope: DatafnPublicLinkShareScope;
  level: DatafnPublicLinkShareLevel;
}

export interface DatafnPublicLinksApi {
  create(input: CreateDatafnPublicLinkInput): Promise<DatafnPublicLinkGrant>;
  revoke(input: { id: string }): Promise<void>;
  resolve(input: { token: string }): Promise<DatafnResolvedPublicLink>;
  principalId(linkId: string): string;
  authPlugin: typeof createDatafnPublicLinkAuthPlugin;
}

/**
 * Creates the DataFn public-link client API backed by the configured remote adapter.
 */
export function createDatafnPublicLinksApi(
  remote: DatafnPublicLinksRemoteAdapter
): DatafnPublicLinksApi {
  return {
    async create(input) {
      const result = await postPublicLink(remote, "public-links", input);
      return result as DatafnPublicLinkGrant;
    },
    async revoke(input) {
      await postPublicLink(remote, "public-links/revoke", input);
    },
    async resolve(input) {
      const result = await postPublicLink(remote, "public-links/resolve", input);
      return result as DatafnResolvedPublicLink;
    },
    principalId(linkId) {
      const normalized = linkId.trim();
      if (!normalized) {
        throw createClientError("DFQL_INVALID", "Public link id is required", {
          path: "id"
        });
      }
      return `public_link:${normalized}`;
    },
    authPlugin: createDatafnPublicLinkAuthPlugin
  };
}

async function postPublicLink(
  remote: DatafnPublicLinksRemoteAdapter,
  endpoint: string,
  payload: unknown
): Promise<unknown> {
  if (!remote.publicLinks) {
    throw createClientError(
      "TRANSPORT_ERROR",
      "DataFn remote adapter does not support public links",
      { path: "sync.remoteAdapter.publicLinks" }
    );
  }
  const response = await remote.publicLinks(endpoint, payload);
  if (response && typeof response === "object") {
    const envelope = response as {
      ok?: boolean;
      result?: unknown;
      error?: { code?: string; message?: string; details?: unknown };
    };
    if (envelope.ok === true) return envelope.result;
    if (envelope.ok === false) {
      throw createClientError(
        "DFQL_INVALID",
        envelope.error?.message ?? "DataFn public link request failed",
        normalizeErrorDetails(envelope.error?.details)
      );
    }
  }
  return response;
}

function normalizeErrorDetails(details: unknown): { path: string; [key: string]: unknown } {
  if (details && typeof details === "object" && !Array.isArray(details)) {
    const record = details as Record<string, unknown>;
    return {
      ...record,
      path: typeof record.path === "string" ? record.path : "$"
    };
  }
  return { path: "$" };
}
