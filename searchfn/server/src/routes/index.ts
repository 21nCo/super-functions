import type { SearchAdapter } from "@searchfn/adapter-contracts";
import { parseJsonBody, mapAdapterErrorToResponse, okResponse } from "../http/errors.js";
import { validateObjectBody, validateResource, validateDocuments } from "../http/validation.js";
import type { ServerLimits } from "../http/validation.js";
import type { ServerContext } from "../server.js";

export function indexHandler(adapter: SearchAdapter, limits: ServerLimits) {
  return async (req: Request, _ctx: ServerContext): Promise<Response> => {
    const parsed = await parseJsonBody(req, limits.maxPayloadBytes);
    if (!parsed.ok) return parsed.response;

    const { value: body, error: bodyErr } = validateObjectBody(parsed.data);
    if (bodyErr) return bodyErr;

    const resourceErr = validateResource(body.resource);
    if (resourceErr) return resourceErr;

    const docsErr = validateDocuments(body.documents, limits);
    if (docsErr) return docsErr;

    try {
      await adapter.index({
        resource: body.resource as string,
        documents: body.documents as any[],
        signal: req.signal,
      });
      return okResponse({ indexed: (body.documents as any[]).length });
    } catch (err) {
      return mapAdapterErrorToResponse(err, "Index operation failed");
    }
  };
}
