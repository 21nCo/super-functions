import { z } from "zod";
import type {
  Action,
  ActionContext,
  ActionContract,
  RequestConfig,
} from "plugfn";

export const jsonValue: z.ZodType<any> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValue),
    z.record(jsonValue),
  ]),
);
export const jsonObject = z.record(jsonValue);
export const remoteId = z.string().min(1).max(1024).refine(value => value !== "." && value !== "..", "Invalid path identifier");
export function restAction(options: {
  name: string;
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: (params: any, context: ActionContext) => string;
  parameters: z.ZodTypeAny;
  returns: z.ZodTypeAny;
  scopes: string[];
  read?: boolean;
  pagination?: ActionContract["pagination"];
  query?: (params: any) => Record<string, unknown>;
  body?: (params: any) => unknown;
  headers?: Record<string, string>;
  successStatus?: number;
}): Action {
  const read = options.read ?? options.method === "GET";
  return {
    name: options.name,
    displayName: options.name,
    description: options.name,
    parameters: options.parameters,
    returns: options.returns,
    idempotent: read,
    cacheable: read,
    contract: {
      version: "1.0.0",
      effect: read
        ? "read"
        : options.method === "DELETE"
          ? "destructive"
          : "write",
      requiredScopes: options.scopes,
      resources: [],
      sensitiveKeys: ["body", "content", "text", "emailAddress", "values"],
      pagination: options.pagination ?? { kind: "none" },
      retry: read ? "safe" : "never",
    },
    async execute(input, context) {
      const params = options.parameters.parse(input);
      const url = options.path(params, context);
      const config: RequestConfig = {
        params: options.query?.(params),
        headers: options.headers,
        redirect: "error",
      };
      const response =
        options.method === "GET"
          ? await context.http.get(url, config)
          : options.method === "DELETE"
            ? await context.http.delete(url, config)
            : options.method === "POST"
              ? await context.http.post(url, options.body?.(params), config)
              : options.method === "PUT"
                ? await context.http.put(url, options.body?.(params), config)
                : await context.http.patch(url, options.body?.(params), config);
      if (
        response.data &&
        typeof response.data === "object" &&
        ("error" in response.data || response.data.ok === false)
      )
        throw new Error("PROVIDER_ACTION_FAILED");
      return options.returns.parse(
        response.status === 204 || response.status === options.successStatus
          ? { success: true }
          : response.data,
      );
    },
  };
}
export const segment = (value: string) => encodeURIComponent(remoteId.parse(value));
