import { Tool, type ToolSchema } from "./base.js";
import { getTransportClient } from "../models/transport.js";
import { enforceOutboundPolicy, resolveSecret } from "./policy.js";

export interface ApiCallArgs {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  auth_secret_ref?: string;
}

const apiCallSchema: ToolSchema<ApiCallArgs> = {
  jsonSchema: {
    type: "object",
    properties: {
      url: { type: "string", description: "The URL to call." },
      method: { type: "string", description: "The HTTP method to use." },
      headers: {
        type: "object",
        description: "Optional HTTP headers.",
        additionalProperties: { type: "string" }
      },
      body: { description: "Optional request body." },
      auth_secret_ref: {
        type: "string",
        description: "Secret reference used to populate the Authorization header."
      }
    },
    required: ["url"]
  },
  parse(data: unknown): ApiCallArgs {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("Expected api_call args object");
    }
    const record = data as Record<string, unknown>;
    if (typeof record.url !== "string") {
      throw new Error("Expected url to be a string");
    }
    if (record.method !== undefined && typeof record.method !== "string") {
      throw new Error("Expected method to be a string");
    }
    if (record.auth_secret_ref !== undefined && typeof record.auth_secret_ref !== "string") {
      throw new Error("Expected auth_secret_ref to be a string");
    }
    if (
      record.headers !== undefined &&
      (!record.headers || typeof record.headers !== "object" || Array.isArray(record.headers))
    ) {
      throw new Error("Expected headers to be an object");
    }

    const headers =
      record.headers === undefined
        ? undefined
        : Object.fromEntries(
            Object.entries(record.headers as Record<string, unknown>).map(([key, value]) => [key, String(value)])
          );

    return {
      url: record.url,
      method: typeof record.method === "string" ? record.method : "GET",
      headers,
      body: record.body,
      auth_secret_ref: record.auth_secret_ref as string | undefined
    };
  }
};

export async function executeApiCall(
  args: ApiCallArgs,
  options: {
    allowPrivateNetwork?: boolean;
    allowedHosts?: readonly string[];
    secretProvider?: (secretRef: string) => string | undefined;
    fetchImpl?: typeof fetch;
    timeout?: number;
  } = {}
): Promise<unknown> {
  enforceOutboundPolicy(args.url, {
    allowPrivateNetwork: options.allowPrivateNetwork,
    allowedHosts: options.allowedHosts
  });

  const headers = new Headers(args.headers);
  const authorization = resolveSecret(args.auth_secret_ref, options.secretProvider);
  if (authorization && !headers.has("authorization")) {
    headers.set("authorization", `Bearer ${authorization}`);
  }

  let body: BodyInit | undefined;
  if (args.body !== undefined) {
    if (typeof args.body === "string" || args.body instanceof URLSearchParams || args.body instanceof Blob) {
      body = args.body;
    } else {
      body = JSON.stringify(args.body);
      if (!headers.has("content-type")) {
        headers.set("content-type", "application/json");
      }
    }
  }

  const url = new URL(args.url);
  const client = getTransportClient({
    baseUrl: url.origin,
    timeout: options.timeout ?? 30_000,
    fetchImpl: options.fetchImpl
  });
  const path = `${url.pathname || "/"}${url.search}`;
  const response = await client.request(path, {
    method: (args.method ?? "GET").toUpperCase(),
    headers,
    body
  });

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return await response.json();
  }
  return await response.text();
}

export const ApiCallTool = new Tool<ApiCallArgs, unknown>({
  name: "api_call",
  description: "Make an HTTP API call to a remote service.",
  schema: apiCallSchema,
  execute: async (args, context) =>
    executeApiCall(args, {
      allowPrivateNetwork: context.policy.allowPrivateNetwork,
      allowedHosts: context.policy.allowedHosts,
      secretProvider: context.policy.secretProvider
    })
});
