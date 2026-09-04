import {
  streamableHttpTarget,
  type McpFnTarget,
} from "@mcpfn/client";
import type { Implementation } from "@modelcontextprotocol/sdk/types.js";

import {
  type McpFnAuthCredential,
  type McpFnAuthCredentialKind,
  type McpFnAuthProviderAdapter,
} from "./auth-core.js";
import { McpFnTestClient, type McpFnTestClientOptions } from "./client.js";

export interface McpFnStaticRemoteAuth {
  headers: HeadersInit;
}

export type McpFnRemoteAuth =
  | McpFnStaticRemoteAuth
  | McpFnAuthCredential
  | McpFnAuthProviderAdapter;

export interface ConnectAuthenticatedHttpTargetOptions {
  url: string | URL;
  auth: McpFnRemoteAuth;
  kind?: McpFnAuthCredentialKind;
  scopes?: string[];
  resource?: string;
  clientInfo?: Implementation;
  client?: McpFnTestClientOptions;
}

export interface ConnectedAuthenticatedHttpTarget {
  client: McpFnTestClient;
  target: McpFnTarget;
  credential?: McpFnAuthCredential;
  close(): Promise<void>;
}

function isAuthProvider(
  value: McpFnRemoteAuth,
): value is McpFnAuthProviderAdapter {
  return typeof (value as McpFnAuthProviderAdapter).issue === "function";
}

function credentialHeaders(
  auth: McpFnStaticRemoteAuth | McpFnAuthCredential,
): HeadersInit {
  return auth.headers;
}

/** Build a Streamable HTTP target from a URL plus explicit request credentials. */
export function authenticatedHttpTarget(
  url: string | URL,
  auth: McpFnStaticRemoteAuth | McpFnAuthCredential,
): McpFnTarget {
  return streamableHttpTarget(url, {
    requestInit: { headers: credentialHeaders(auth) },
  });
}

async function resolveRemoteAuth(
  auth: McpFnRemoteAuth,
  kind: McpFnAuthCredentialKind,
  scopes?: string[],
  resource?: string,
): Promise<{ targetAuth: McpFnStaticRemoteAuth | McpFnAuthCredential; credential?: McpFnAuthCredential }> {
  if (!isAuthProvider(auth)) {
    return { targetAuth: auth, credential: "kind" in auth ? auth : undefined };
  }
  const credential = await auth.issue({ kind, scopes, resource });
  return { targetAuth: credential, credential };
}

/**
 * Connect the production client to a remote MCP URL using an explicit auth
 * provider or header map. Callers never construct McpFnServer or McpFnRegistry.
 */
export async function connectAuthenticatedHttpTarget(
  options: ConnectAuthenticatedHttpTargetOptions,
): Promise<ConnectedAuthenticatedHttpTarget> {
  const { targetAuth, credential } = await resolveRemoteAuth(
    options.auth,
    options.kind ?? (isAuthProvider(options.auth) ? "oauth" : "api-key"),
    options.scopes,
    options.resource,
  );
  const target = authenticatedHttpTarget(options.url, targetAuth);
  const client = await McpFnTestClient.connectTarget(
    target,
    options.clientInfo ?? { name: "mcpfn-remote-target", version: "0.0.1" },
    options.client,
  );
  return {
    client,
    target,
    credential,
    close: async () => {
      await client.close();
      await credential?.dispose?.();
      if (isAuthProvider(options.auth) && credential) {
        await options.auth.revoke?.(credential);
      }
    },
  };
}
