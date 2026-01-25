/**
 * REST Route Handlers
 *
 * Provides schema-driven REST wrappers for DFQL query/mutation.
 */

import type { DatafnSchema } from "@datafn/core";
import { errorResponse } from "../http/errors.js";
import { jsonResponse, parseJsonBody } from "../http/json.js";
import type { Route } from "@superfunctions/http";

// Use Record<string, any> or generic for execute callbacks
type MutationExecutor = (m: unknown) => Promise<unknown>;
type QueryExecutor = (q: unknown) => Promise<unknown>;

export function createRestRoutes<TContext>(
  schema: DatafnSchema,
  executeMutation: MutationExecutor,
  executeQuery: QueryExecutor,
): Route<TContext>[] {
  const resources = new Set(
    schema.resources.map((r: { name: string }) => r.name),
  );

  // Helper to get resource version from schema (REST-001)
  const getResourceVersion = (resourceName: string): number => {
    const resource = schema.resources.find((r: any) => r.name === resourceName);
    return resource?.version ?? 1;
  };

  const validateResource = (resource: string) => {
    if (!resources.has(resource)) {
      throw {
        code: "DFQL_UNKNOWN_RESOURCE",
        message: `Unknown resource: ${resource}`,
        details: { path: "resource", resource },
      };
    }
  };

  return [
    // GET /datafn/resources/:resource - Query Wrapper
    {
      method: "GET",
      path: "/datafn/resources/:resource",
      handler: async (req) => {
        const url = new URL(req.url);
        const pathParts = url.pathname.split("/");
        const resource = pathParts[3];

        try {
          validateResource(resource);

          // REST-003: Parse q as URL-encoded JSON, default to {}
          const qStr = url.searchParams.get("q");
          let queryBody: any;

          if (!qStr) {
            queryBody = {};
          } else {
            try {
              queryBody = JSON.parse(qStr);
            } catch (parseError) {
              // REST-003: Invalid JSON in q returns DFQL_INVALID with path:"q"
              return errorResponse(
                {
                  code: "DFQL_INVALID",
                  message: "Invalid JSON",
                  details: { path: "q" },
                },
                400,
              );
            }
          }

          // REST-001: Inject version from schema
          const dfql = {
            resource,
            version: getResourceVersion(resource),
            ...queryBody,
          };

          const result = await executeQuery(dfql);
          return jsonResponse({ ok: true, result });
        } catch (err: any) {
          if (err.code === "DFQL_UNKNOWN_RESOURCE") {
            return errorResponse(err, 400);
          }
          return errorResponse(err);
        }
      },
    },

    // POST /datafn/resources/:resource - Mutation (Merge/Insert) Wrapper
    {
      method: "POST",
      path: "/datafn/resources/:resource",
      handler: async (req) => {
        const url = new URL(req.url);
        const pathParts = url.pathname.split("/");
        const resource = pathParts[3];

        try {
          validateResource(resource);
          const body = (await parseJsonBody(req)) as any;

          // REST-002: Require deterministic clientId and mutationId
          // Check query params first, then body
          const clientId = url.searchParams.get("clientId") || body.clientId;
          const mutationId =
            url.searchParams.get("mutationId") || body.mutationId;

          if (!clientId || typeof clientId !== "string") {
            return errorResponse(
              {
                code: "DFQL_INVALID",
                message: "Invalid DFQL: clientId is required",
                details: { path: "clientId" },
              },
              400,
            );
          }

          if (!mutationId || typeof mutationId !== "string") {
            return errorResponse(
              {
                code: "DFQL_INVALID",
                message: "Invalid DFQL: mutationId is required",
                details: { path: "mutationId" },
              },
              400,
            );
          }

          // REST-004: Default operation to "merge" when absent
          const mutation = {
            resource,
            version: getResourceVersion(resource), // REST-001
            operation: body.operation || "merge",
            clientId,
            mutationId,
            id: body.id,
            record: body.record,
          };

          const result = await executeMutation(mutation);
          return jsonResponse({ ok: true, result });
        } catch (err: any) {
          if (err.code === "DFQL_UNKNOWN_RESOURCE") {
            return errorResponse(err, 400);
          }
          return errorResponse(err);
        }
      },
    },

    // PATCH /datafn/resources/:resource/:id - Merge Wrapper
    {
      method: "PATCH",
      path: "/datafn/resources/:resource/:id",
      handler: async (req) => {
        const url = new URL(req.url);
        const pathParts = url.pathname.split("/");
        const resource = pathParts[3];
        const id = pathParts[4];

        try {
          validateResource(resource);
          const body = (await parseJsonBody(req)) as any;

          // REST-002: Require deterministic clientId and mutationId
          const clientId = url.searchParams.get("clientId") || body.clientId;
          const mutationId =
            url.searchParams.get("mutationId") || body.mutationId;

          if (!clientId || typeof clientId !== "string") {
            return errorResponse(
              {
                code: "DFQL_INVALID",
                message: "Invalid DFQL: clientId is required",
                details: { path: "clientId" },
              },
              400,
            );
          }

          if (!mutationId || typeof mutationId !== "string") {
            return errorResponse(
              {
                code: "DFQL_INVALID",
                message: "Invalid DFQL: mutationId is required",
                details: { path: "mutationId" },
              },
              400,
            );
          }

          const mutation = {
            resource,
            version: getResourceVersion(resource), // REST-001
            operation: "merge",
            clientId,
            mutationId,
            id: id,
            record: body.record,
          };

          const result = await executeMutation(mutation);
          return jsonResponse({ ok: true, result });
        } catch (err: any) {
          if (err.code === "DFQL_UNKNOWN_RESOURCE") {
            return errorResponse(err, 400);
          }
          return errorResponse(err);
        }
      },
    },

    // DELETE /datafn/resources/:resource/:id - Delete Wrapper
    {
      method: "DELETE",
      path: "/datafn/resources/:resource/:id",
      handler: async (req) => {
        const url = new URL(req.url);
        const pathParts = url.pathname.split("/");
        const resource = pathParts[3];
        const id = pathParts[4];

        try {
          validateResource(resource);

          // REST-002: Require deterministic clientId and mutationId from query params
          const clientId = url.searchParams.get("clientId");
          const mutationId = url.searchParams.get("mutationId");

          if (!clientId || typeof clientId !== "string") {
            return errorResponse(
              {
                code: "DFQL_INVALID",
                message: "Invalid DFQL: clientId is required",
                details: { path: "clientId" },
              },
              400,
            );
          }

          if (!mutationId || typeof mutationId !== "string") {
            return errorResponse(
              {
                code: "DFQL_INVALID",
                message: "Invalid DFQL: mutationId is required",
                details: { path: "mutationId" },
              },
              400,
            );
          }

          const mutation = {
            resource,
            version: getResourceVersion(resource), // REST-001
            operation: "delete",
            clientId,
            mutationId,
            id: id,
          };

          const result = await executeMutation(mutation);
          return jsonResponse({ ok: true, result });
        } catch (err: any) {
          if (err.code === "DFQL_UNKNOWN_RESOURCE") {
            return errorResponse(err, 400);
          }
          return errorResponse(err);
        }
      },
    },
  ];
}
