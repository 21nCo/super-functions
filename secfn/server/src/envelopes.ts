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
        code: routerError.code ?? codeForStatus(routerError.statusCode),
        message: routerError.message,
      },
    },
    { status: routerError.statusCode },
  );
}

function codeForStatus(statusCode: number): string {
  return ({
    400: "SECFN_BAD_REQUEST",
    401: "SECFN_UNAUTHORIZED",
    403: "SECFN_FORBIDDEN",
    404: "SECFN_NOT_FOUND",
    405: "SECFN_METHOD_NOT_ALLOWED",
    409: "SECFN_CONFLICT",
    413: "SECFN_PAYLOAD_TOO_LARGE",
    422: "SECFN_UNPROCESSABLE_ENTITY",
    429: "SECFN_RATE_LIMITED",
  } as Record<number, string>)[statusCode] ?? (statusCode >= 500 ? "SECFN_INTERNAL" : "SECFN_HTTP_ERROR");
}

export async function readJson<T>(context: { json<TValue = unknown>(): Promise<TValue> }): Promise<T> {
  try {
    return await context.json<T>();
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
