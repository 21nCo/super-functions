import {
  BadRequestError,
  ForbiddenError,
  InternalServerError,
  NotFoundError,
  RouterError,
  UnauthorizedError,
} from "@superfunctions/http";
import {
  SecFnError,
  SecFnForbiddenError,
  SecFnNotFoundError,
  SecFnUnauthorizedError,
  SecFnValidationError,
} from "@secfn/core";

export function ok(data: unknown, init?: ResponseInit): Response {
  return Response.json({ ok: true, data }, init);
}

export function emptyOk(init?: ResponseInit): Response {
  return Response.json({ ok: true, data: null }, init);
}

export function errorResponse(error: unknown): Response {
  const routerError = toRouterError(error);
  return Response.json(
    {
      ok: false,
      error: {
        code: routerError.code ?? "SECFN_INTERNAL",
        message: routerError.message,
      },
    },
    { status: routerError.statusCode },
  );
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return await request.json() as T;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new BadRequestError("Invalid JSON", "SECFN_BAD_JSON");
    }
    throw error;
  }
}

function toRouterError(error: unknown): RouterError {
  if (error instanceof RouterError) return error;
  if (error instanceof SecFnUnauthorizedError) return new UnauthorizedError(error.message, error.code);
  if (error instanceof SecFnForbiddenError) return new ForbiddenError(error.message, error.code);
  if (error instanceof SecFnNotFoundError) return new NotFoundError(error.message, error.code);
  if (error instanceof SecFnValidationError) return new BadRequestError(error.message, error.code);
  if (error instanceof SecFnError) return new BadRequestError(error.message, error.code);
  return new InternalServerError("Internal Server Error", "SECFN_INTERNAL");
}
