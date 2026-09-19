import type { AuthSession } from "@superfunctions/auth";
import { createRouter, type Route, type RouteContext, type Router, type Middleware } from "@superfunctions/http";

import { CancellationToken } from "../utils/cancel.js";
import { ValidationError } from "../core/errors.js";
import { LangFn } from "../client.js";
import type { Message } from "../core/types.js";
import { createLangFnAuthMiddleware, type LangFnAuthOptions } from "./auth.js";
import {
  createLangFnRateLimitMiddleware,
  type CanonicalTenantContext,
  type RateLimitProvider
} from "./rate_limit.js";
import {
  createErrorEnvelope,
  createSuccessEnvelope,
  parseChatBody,
  parseCompleteBody,
  parseEmbedBody,
  parseFeedbackBody,
  parseJsonBody,
  parseMessages,
  parseStreamBody,
  parseTracesQuery,
  toHttpErrorPayload,
} from "./validation.js";

export interface LangFnRouteContext extends Record<string, unknown> {
  auth?: AuthSession;
  tenantContext?: CanonicalTenantContext;
  rateLimit?: unknown;
}

export interface LangFnHttpOptions<TSession extends AuthSession = AuthSession> {
  auth?: LangFnAuthOptions<TSession>;
  rateLimit?: {
    provider?: RateLimitProvider;
  };
  /** Maximum JSON request body size. Defaults to 1 MiB. */
  maxBodyBytes?: number;
}

const HEALTH_METADATA = { status: "ok", name: "langfn", version: "0.1.0" } as const;
const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;

export function createLangFnRoutes<TSession extends AuthSession = AuthSession>(
  lang: LangFn,
  options: LangFnHttpOptions<TSession> = {}
): Route<LangFnRouteContext>[] {
  if (["tenantContext", "rateLimit", "params", "query", "url", "json", "formData", "text"].includes(options.auth?.contextKey ?? "auth")) {
    throw new ValidationError("Auth contextKey collides with a reserved route context key");
  }
  const secure = (routeId: string) => [
    createLangFnAuthMiddleware(options.auth),
    ((request, context, next) => {
      context.tenantContext = extractTenantContext(request, context[options.auth?.contextKey ?? "auth"] as AuthSession | undefined);
      return next();
    }) satisfies Middleware<Record<string, unknown>>,
    createLangFnRateLimitMiddleware({
      provider: options.rateLimit?.provider,
      routeId,
      contextKey: options.auth?.contextKey,
      getTenantContext: (request, context) => {
        const tenantContext = extractTenantContext(request, context[options.auth?.contextKey ?? "auth"] as AuthSession | undefined);
        context.tenantContext = tenantContext;
        return tenantContext;
      }
    })
  ];

  return [
    {
      method: "GET",
      path: "/health",
      meta: { auth: { mode: "none" } },
      handler: async () =>
        Response.json(createSuccessEnvelope(HEALTH_METADATA), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
    },
    {
      method: "POST",
      path: "/complete",
      middleware: secure("/complete"),
      meta: { auth: { mode: "hybrid" } },
      handler: async (request: Request, context: LangFnRouteContext & RouteContext) => {
        const body = await parseJsonBody(context, parseCompleteBody);
        if (!body.ok) {
          return Response.json(body.body, { status: body.status, headers: { "content-type": "application/json" } });
        }

        try {
          const metadata = mergeMetadata(body.data.metadata, context.tenantContext);
          const result = await lang.complete(body.data.prompt, { metadata });
          return Response.json(
            createSuccessEnvelope(
              {
                content: result.content,
                usage: result.usage,
                cost: result.cost
              },
              result.traceId ?? result.trace_id
            ),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        } catch (error) {
          return toErrorResponse(error);
        }
      }
    },
    {
      method: "POST",
      path: "/chat",
      middleware: secure("/chat"),
      meta: { auth: { mode: "hybrid" } },
      handler: async (request: Request, context: LangFnRouteContext & RouteContext) => {
        const body = await parseJsonBody(context, parseChatBody);
        if (!body.ok) {
          return Response.json(body.body, { status: body.status, headers: { "content-type": "application/json" } });
        }

        try {
          const metadata = mergeMetadata(body.data.metadata, context.tenantContext);
          const result = await lang.chat(parseMessages(body.data.messages as Message[]), {
            tools: body.data.tools as any,
            tool_choice: body.data.tool_choice,
            metadata
          });
          return Response.json(
            createSuccessEnvelope(
              {
                message: result.message,
                toolCalls: result.toolCalls ?? result.tool_calls,
                usage: result.usage,
                cost: result.cost
              },
              result.traceId ?? result.trace_id
            ),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        } catch (error) {
          return toErrorResponse(error);
        }
      }
    },
    {
      method: "POST",
      path: "/stream",
      middleware: secure("/stream"),
      meta: { auth: { mode: "hybrid" } },
      handler: async (request: Request, context: LangFnRouteContext & RouteContext) => {
        const body = await parseJsonBody(context, parseStreamBody);
        if (!body.ok) {
          return Response.json(body.body, { status: body.status, headers: { "content-type": "application/json" } });
        }

        const metadata = mergeMetadata(body.data.metadata, context.tenantContext);
        const input = "prompt" in body.data ? body.data.prompt : parseMessages(body.data.messages);
        const encoder = new TextEncoder();
        const cancelToken = new CancellationToken();
        const iterator = lang.streamSSE(input as string | Message[], { metadata, cancelToken })[Symbol.asyncIterator]();
        let closed = false;
        let streamController: ReadableStreamDefaultController<Uint8Array>;
        const cleanup = () => request.signal.removeEventListener("abort", abort);
        const stop = () => {
          closed = true;
          cleanup();
          cancelToken.cancel();
          void Promise.resolve().then(() => iterator.return?.()).catch(() => {});
        };
        const abort = () => {
          if (closed) return;
          stop();
          streamController.close();
        };
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            streamController = controller;
            request.signal.addEventListener("abort", abort, { once: true });
            if (request.signal.aborted) abort();
          },
          async pull(controller) {
            if (closed) return;
            try {
              const result = await iterator.next();
              if (closed) return;
              if (result.done) {
                closed = true;
                cleanup();
                controller.close();
              } else {
                controller.enqueue(encoder.encode(result.value));
              }
            } catch (error) {
              if (closed) return;
              const payload = toHttpErrorPayload(error);
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(createErrorEnvelope(payload.code, payload.message, payload.details))}\n\n`));
              stop();
              controller.close();
            }
          },
          cancel() { stop(); }
        });

        return new Response(stream, {
          status: 200,
          headers: {
            "content-type": "text/event-stream",
            "cache-control": "no-cache"
          }
        });
      }
    },
    {
      method: "POST",
      path: "/embed",
      middleware: secure("/embed"),
      meta: { auth: { mode: "hybrid" } },
      handler: async (_request: Request, context: LangFnRouteContext & RouteContext) => {
        const body = await parseJsonBody(context, parseEmbedBody);
        if (!body.ok) {
          return Response.json(body.body, { status: body.status, headers: { "content-type": "application/json" } });
        }

        try {
          const embeddings = await lang.embed(body.data.texts);
          return Response.json(createSuccessEnvelope({ embeddings }), {
            status: 200,
            headers: { "content-type": "application/json" }
          });
        } catch (error) {
          return toErrorResponse(error);
        }
      }
    },
    {
      method: "GET",
      path: "/traces",
      middleware: secure("/traces"),
      meta: { auth: { mode: "hybrid" } },
      handler: async (_request: Request, context: LangFnRouteContext & RouteContext) => {
        try {
          const parsed = parseTracesQuery(Object.fromEntries(context.query.entries()));
          if (!context.tenantContext?.userId) return Response.json(createErrorEnvelope("AUTH_REQUIRED", "Authenticated identity required"), { status: 401 });
          const traces = await lang.getTraces({ ...parsed, tenantId: context.tenantContext.tenantId, userId: context.tenantContext.userId });
          return Response.json(createSuccessEnvelope({ traces }), {
            status: 200,
            headers: { "content-type": "application/json" }
          });
        } catch (error) {
          return toErrorResponse(error);
        }
      }
    },
    {
      method: "POST",
      path: "/feedback",
      middleware: secure("/feedback"),
      meta: { auth: { mode: "hybrid" } },
      handler: async (request: Request, context: LangFnRouteContext & RouteContext) => {
        const body = await parseJsonBody(context, parseFeedbackBody);
        if (!body.ok) {
          return Response.json(body.body, { status: body.status, headers: { "content-type": "application/json" } });
        }

        try {
          if (!context.tenantContext?.userId) return Response.json(createErrorEnvelope("AUTH_REQUIRED", "Authenticated identity required"), { status: 401 });
          await lang.feedback({
            ...body.data,
            scope: { tenantId: context.tenantContext.tenantId, userId: context.tenantContext.userId },
            metadata: mergeMetadata(body.data.metadata, context.tenantContext)
          });
          return Response.json(createSuccessEnvelope({ accepted: true }, body.data.traceId ?? null), {
            status: 200,
            headers: { "content-type": "application/json" }
          });
        } catch (error) {
          return toErrorResponse(error);
        }
      }
    }
  ];
}

export function createLangFnRouter<TSession extends AuthSession = AuthSession>(
  lang: LangFn,
  options: LangFnHttpOptions<TSession> = {}
): Router<LangFnRouteContext> {
  return createRouter({
    routes: createLangFnRoutes(lang, options),
    maxBodyBytes: options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES
  });
}

export function extractTenantContext(
  request: Request,
  session?: AuthSession
): CanonicalTenantContext {
  return {
    tenantId: session?.subject.tenantId,
    userId: session?.subject.actorId,
    runId: request.headers.get("x-run-id") ?? undefined,
    conversationId: request.headers.get("x-conversation-id") ?? undefined
  };
}

function mergeMetadata(
  metadata: Record<string, unknown> | undefined,
  tenantContext: CanonicalTenantContext | undefined
): Record<string, unknown> {
  return {
    ...(metadata ?? {}),
    ...(tenantContext ?? {})
  };
}

function toErrorResponse(error: unknown): Response {
  const payload = toHttpErrorPayload(error);
  return Response.json(createErrorEnvelope(payload.code, payload.message, payload.details), {
    status: payload.status,
    headers: { "content-type": "application/json" }
  });
}
