import { z } from "zod";
import {
  AuthType,
  type Action,
  type ActionContext,
  type Provider,
} from "plugfn";

type Schema = {
  repeated?: boolean;
  $ref?: string;
  type?: string;
  format?: string;
  enum?: string[];
  properties?: Record<string, Schema>;
  items?: Schema;
  required?: boolean | string[];
  additionalProperties?: Schema;
  minimum?: string | number;
  maximum?: string | number;
  location?: string;
};
type Method = {
  supportsMediaUpload?: boolean;
  mediaUpload?: { protocols?: { simple?: { path: string } } };
  supportsMediaDownload?: boolean;
  id: string;
  path: string;
  httpMethod: string;
  parameters?: Record<string, Schema>;
  request?: Schema;
  response?: Schema;
  scopes?: string[];
  description?: string;
};
export interface Discovery {
  rootUrl: string;
  servicePath: string;
  methods: Record<string, Method>;
  schemas: Record<string, Schema>;
}

/** Build only reviewed, explicitly selected methods from a pinned Google Discovery snapshot. */
export function googleDiscoveryProvider(
  name: string,
  document: Discovery,
  mappings: Record<string, string>,
  scopes: string[],
): Provider {
  const cache = new Map<string, z.ZodTypeAny>();
  function schema(value: Schema): z.ZodTypeAny {
    if (value.repeated) return z.array(schema({ ...value, repeated: false }));
    if (value.$ref) {
      const ref = value.$ref;
      if (!document.schemas[ref])
        throw new Error(`Missing discovery schema ${ref}`);
      if (!cache.has(ref))
        cache.set(
          ref,
          z.lazy(() => schema(document.schemas[ref])),
        );
      return cache.get(ref)!;
    }
    switch (value.type) {
      case "string":
        return value.enum?.length
          ? z.enum(value.enum as [string, ...string[]])
          : z.string();
      case "integer":
      case "number": {
        let result = value.type === "integer" ? z.number().int() : z.number();
        if (value.minimum !== undefined)
          result = result.min(Number(value.minimum));
        if (value.maximum !== undefined)
          result = result.max(Number(value.maximum));
        return result;
      }
      case "boolean":
        return z.boolean();
      case "array":
        return z.array(schema(value.items ?? {}));
      case "object": {
        if (!value.properties && value.additionalProperties)
          return z.record(schema(value.additionalProperties));
        const required = Array.isArray(value.required) ? value.required : [];
        return z
          .object(
            Object.fromEntries(
              Object.entries(value.properties ?? {}).map(([key, item]) => [
                key,
                required.includes(key) || item.required === true
                  ? schema(item)
                  : schema(item).optional(),
              ]),
            ),
          )
          .passthrough();
      }
      default:
        return z.unknown();
    }
  }
  const actions: Record<string, Action> = {};
  for (const [actionName, methodName] of Object.entries(mappings)) {
    const method = document.methods[methodName];
    if (!method)
      throw new Error(`Unknown selected Google method ${methodName}`);
    const read = method.httpMethod === "GET" || methodName === "freebusy.query";
    const params = Object.fromEntries(
      Object.entries(method.parameters ?? {}).map(([key, value]) => [
        key,
        value.required ? schema(value) : schema(value).optional(),
      ]),
    );
    if (method.supportsMediaUpload)
      params.media = z
        .object({
          base64: z.string().max(28 * 1024 * 1024),
          mimeType: z
            .string()
            .regex(/^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+$/),
        })
        .strict()
        .optional();
    if (method.supportsMediaDownload)
      params.alt = z.enum(["json", "media"]).optional();
    if (method.request) params.body = schema(method.request);
    const parameters = z.object(params).strict();
    const binarySchema = z.object({
      base64: z.string(),
      mimeType: z.string(),
      byteLength: z.number().int().nonnegative(),
    });
    const structuredReturns = method.response
      ? schema(method.response)
      : z.object({ success: z.literal(true) });
    const returns = method.supportsMediaDownload
      ? z.union([binarySchema, structuredReturns])
      : structuredReturns;
    const cursor = "pageToken" in params;
    actions[actionName] = {
      name: actionName,
      displayName: actionName,
      description: method.description ?? actionName,
      parameters,
      returns,
      idempotent: read,
      cacheable: read,
      contract: {
        version: "1.0.0",
        effect: read
          ? "read"
          : method.httpMethod === "DELETE"
            ? "destructive"
            : "write",
        requiredScopes: scopes,
        resources: Object.entries(method.parameters ?? {})
          .filter(([, p]) => p.location === "path")
          .map(([key]) => ({ kind: name, parameter: key })),
        sensitiveKeys: ["body", "content", "values", "emailAddress"],
        pagination: cursor
          ? { kind: "cursor", cursorParameter: "pageToken" }
          : { kind: "none" },
        retry: read ? "safe" : "never",
      },
      async execute(input: unknown, context: ActionContext) {
        const validated = parameters.parse(input);
        const query: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(validated)) {
          if (
            method.parameters?.[key]?.location === "query" &&
            value !== undefined
          )
            query[key] = value;
        }
        const template = validated.media
          ? method.mediaUpload?.protocols?.simple?.path
          : method.path;
        if (!template) throw new Error("GOOGLE_MEDIA_UPLOAD_UNSUPPORTED");
        const path = template.replace(
          /\{(\+?)([^}]+)\}/g,
          (_, _reserved, key: string) => {
            const value = validated[key];
            if (typeof value !== "string" || !value || value === "." || value === "..")
              throw new Error(`Missing path parameter ${key}`);
            // Values cannot change origin or inject path/query fragments.
            return encodeURIComponent(value);
          },
        );
        const url = path.startsWith("/")
          ? `${document.rootUrl.replace(/\/$/, "")}${path}`
          : `${document.rootUrl}${document.servicePath}${path}`;
        const binary =
          method.supportsMediaDownload &&
          (validated.alt === "media" || methodName === "files.export");
        if (validated.alt) query.alt = validated.alt;
        let body = validated.body;
        let uploadConfig = {};
        if (validated.media) {
          const boundary = `plugfn-${crypto.randomUUID()}`;
          const decoded = atob(validated.media.base64);
          if (decoded.length > 20 * 1024 * 1024)
            throw new Error("GOOGLE_MEDIA_TOO_LARGE");
          const prefix = new TextEncoder().encode(
            `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(body)}\r\n--${boundary}\r\nContent-Type: ${validated.media.mimeType}\r\n\r\n`,
          );
          const suffix = new TextEncoder().encode(`\r\n--${boundary}--\r\n`);
          const payload = new Uint8Array(
            prefix.length + decoded.length + suffix.length,
          );
          payload.set(prefix);
          for (let i = 0; i < decoded.length; i++)
            payload[prefix.length + i] = decoded.charCodeAt(i);
          payload.set(suffix, prefix.length + decoded.length);
          body = payload;
          query.uploadType = "multipart";
          uploadConfig = {
            bodyEncoding: "raw",
            headers: {
              "Content-Type": `multipart/related; boundary=${boundary}`,
            },
          };
        }
        const config = {
          ...uploadConfig,
          params: query,
          redirect: "error" as const,
          ...(binary ? { responseType: "arrayBuffer" as const } : {}),
        };
        const response =
          method.httpMethod === "GET"
            ? await context.http.get(url, config)
            : method.httpMethod === "DELETE"
              ? await context.http.delete(url, config)
              : method.httpMethod === "PUT"
                ? await context.http.put(url, body, config)
                : method.httpMethod === "PATCH"
                  ? await context.http.patch(url, body, config)
                  : await context.http.post(url, body, config);
        if (binary) {
          const bytes = new Uint8Array(response.data);
          let encoded = "";
          for (let i = 0; i < bytes.length; i += 8192)
            encoded += String.fromCharCode(...bytes.subarray(i, i + 8192));
          return binarySchema.parse({
            base64: btoa(encoded),
            mimeType:
              response.headers["content-type"] ?? "application/octet-stream",
            byteLength: bytes.length,
          });
        }
        return structuredReturns.parse(
          method.response ? response.data : { success: true },
        );
      },
    };
  }
  return {
    name,
    displayName: name,
    description: `Selected ${name} actions from a pinned Google Discovery contract`,
    version: "1.0.0",
    baseUrl: document.rootUrl + document.servicePath,
    auth: {
      type: AuthType.OAuth2,
      config: {
        authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        scopes,
        scopeSeparator: " ",
        revocationUrl: "https://oauth2.googleapis.com/revoke",
        extraAuthParams: {
          access_type: "offline",
          include_granted_scopes: "true",
        },
      },
    },
    actions,
  };
}
