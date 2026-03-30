import type { SearchAdapter } from "@searchfn/adapter-contracts";
import { parseJsonBody, mapAdapterErrorToResponse, okResponse } from "../http/errors.js";
import { validateObjectBody, validateResource, validateIds } from "../http/validation.js";
import type { ServerLimits } from "../http/validation.js";
import type { ServerContext } from "../server.js";

export function removeHandler(adapter: SearchAdapter, limits: ServerLimits) {
  return async (req: Request, _ctx: ServerContext): Promise<Response> => {
    const parsed = await parseJsonBody(req, limits.maxPayloadBytes);
    if (!parsed.ok) return parsed.response;

    const { value: body, error: bodyErr } = validateObjectBody(parsed.data);
    if (bodyErr) return bodyErr;

    const resourceErr = validateResource(body.resource);
    if (resourceErr) return resourceErr;

    const idsErr = validateIds(body.ids);
    if (idsErr) return idsErr;

    try {
      await adapter.remove({
        resource: body.resource as string,
        ids: body.ids as Array<string | number>,
        signal: req.signal,
      });
      return okResponse({ removed: (body.ids as any[]).length });
    } catch (err) {
      return mapAdapterErrorToResponse(err, "Remove operation failed");
    }
  };
}
