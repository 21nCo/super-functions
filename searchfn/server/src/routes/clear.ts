import type { SearchAdapter } from "@searchfn/adapter-contracts";
import { parseJsonBody, mapAdapterErrorToResponse, okResponse } from "../http/errors.js";
import { validateObjectBody, validateResource } from "../http/validation.js";
import type { ServerLimits } from "../http/validation.js";
import type { ServerContext } from "../server.js";

export function clearHandler(adapter: SearchAdapter, limits: ServerLimits) {
  return async (req: Request, _ctx: ServerContext): Promise<Response> => {
    const parsed = await parseJsonBody(req, limits.maxPayloadBytes);
    if (!parsed.ok) return parsed.response;

    const { value: body, error: bodyErr } = validateObjectBody(parsed.data);
    if (bodyErr) return bodyErr;

    const resourceErr = validateResource(body.resource);
    if (resourceErr) return resourceErr;

    try {
      await adapter.clear(body.resource as string, req.signal);
      return okResponse({ cleared: body.resource });
    } catch (err) {
      return mapAdapterErrorToResponse(err, "Clear operation failed");
    }
  };
}
