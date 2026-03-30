import type { SearchAdapter } from "@searchfn/adapter-contracts";
import { parseJsonBody, errorResponse, mapAdapterErrorToResponse, okResponse } from "../http/errors.js";
import {
  validateFieldBoosts,
  validateFields,
  validateFuzzy,
  validateLimit,
  validateObjectBody,
  validatePrefix,
  validateQuery,
  validateResourcesArray,
} from "../http/validation.js";
import type { ServerLimits } from "../http/validation.js";
import type { ServerContext } from "../server.js";

export function searchAllHandler(adapter: SearchAdapter, limits: ServerLimits) {
  return async (req: Request, _ctx: ServerContext): Promise<Response> => {
    const parsed = await parseJsonBody(req, limits.maxPayloadBytes);
    if (!parsed.ok) return parsed.response;

    const { value: body, error: bodyErr } = validateObjectBody(parsed.data);
    if (bodyErr) return bodyErr;

    const queryErr = validateQuery(body.query, limits);
    if (queryErr) return queryErr;

    const resourcesErr = validateResourcesArray(body.resources, limits);
    if (resourcesErr) return resourcesErr;

    const { value: limit, error: limitErr } = validateLimit(
      body.limit,
      limits.maxLimit,
    );
    if (limitErr) return limitErr;

    const { value: limitPerResource, error: lprErr } = validateLimit(
      body.limitPerResource,
      limits.maxLimitPerResource,
      "limitPerResource",
    );
    if (lprErr) return lprErr;

    const fieldsErr = validateFields(body.fields);
    if (fieldsErr) return fieldsErr;

    const fuzzyErr = validateFuzzy(body.fuzzy);
    if (fuzzyErr) return fuzzyErr;

    const prefixErr = validatePrefix(body.prefix);
    if (prefixErr) return prefixErr;

    const fieldBoostsErr = validateFieldBoosts(body.fieldBoosts);
    if (fieldBoostsErr) return fieldBoostsErr;

    if (!adapter.searchAll) {
      // Fallback: adapter doesn't support searchAll natively
      if (!body.resources || (body.resources as string[]).length === 0) {
        return errorResponse(
          "DFQL_INVALID",
          "resources are required when adapter.searchAll is unavailable",
          { path: "resources" },
        );
      }
      // Manual per-resource search and merge
      try {
        const resources = body.resources as string[];
        const allResults: Array<{ resource: string; id: string | number; score: number }> = [];
        for (const resource of resources) {
          const ids = await adapter.search({
            resource,
            query: body.query as string,
            fields: Array.isArray(body.fields) ? body.fields : undefined,
            limit: limitPerResource,
            fuzzy: body.fuzzy as boolean | number | undefined,
            prefix: body.prefix as boolean | undefined,
            fieldBoosts: body.fieldBoosts as Record<string, number> | undefined,
            signal: req.signal,
          });
          // No score info from basic search — assign descending by rank
          ids.forEach((id, i) => {
            allResults.push({ resource, id, score: ids.length - i });
          });
        }
        // Deterministic sort: score desc, resource asc, id asc (stringified)
        allResults.sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          if (a.resource !== b.resource) return a.resource < b.resource ? -1 : 1;
          const aId = String(a.id);
          const bId = String(b.id);
          return aId < bId ? -1 : aId > bId ? 1 : 0;
        });
        return okResponse({ results: allResults.slice(0, limit) });
      } catch (err) {
        return mapAdapterErrorToResponse(err, "Search-all fallback failed");
      }
    }

    try {
      const results = await adapter.searchAll({
        query: body.query as string,
        resources: body.resources as string[] | undefined,
        fields: Array.isArray(body.fields) ? body.fields : undefined,
        limit,
        limitPerResource,
        fuzzy: body.fuzzy as boolean | number | undefined,
        prefix: body.prefix as boolean | undefined,
        fieldBoosts: body.fieldBoosts as Record<string, number> | undefined,
        signal: req.signal,
      });
      return okResponse({ results });
    } catch (err) {
      return mapAdapterErrorToResponse(err, "Search-all operation failed");
    }
  };
}
