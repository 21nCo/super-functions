import type { AuthSession } from "@superfunctions/auth";
import { createRouter, type Route, type RouteContext, type Router } from "@superfunctions/http";

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
}

const HEALTH_METADATA = { status: "ok", name: "langfn", version: "0.1.0" } as const;

export function createLangFnRoutes<TSession extends AuthSession = AuthSession>(
  lang: LangFn,
  options: LangFnHttpOptions<TSession> = {}
): Route<LangFnRouteContext>[] {
  const secure = (routeId: string) => [
    createLangFnAuthMiddleware(options.auth),
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
        const body = await parseJsonBody(request, parseCompleteBody);
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
        const body = await parseJsonBody(request, parseChatBody);
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
        const body = await parseJsonBody(request, parseStreamBody);
        if (!body.ok) {
          return Response.json(body.body, { status: body.status, headers: { "content-type": "application/json" } });
        }

        const metadata = mergeMetadata(body.data.metadata, context.tenantContext);
        const input = "prompt" in body.data ? body.data.prompt : parseMessages(body.data.messages);
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            try {
              for await (const chunk of lang.streamSSE(input as string | Message[], { metadata })) {
                controller.enqueue(encoder.encode(chunk));
              }
            } catch (error) {
              const payload = toHttpErrorPayload(error);
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(createErrorEnvelope(payload.code, payload.message, payload.details))}\n\n`)
              );
            } finally {
              controller.close();
            }
          }
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
      handler: async (request: Request) => {
        const body = await parseJsonBody(request, parseEmbedBody);
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
        const body = await parseJsonBody(request, parseFeedbackBody);
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
    routes: createLangFnRoutes(lang, options)
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
