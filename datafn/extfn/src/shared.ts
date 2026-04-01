import type { RuntimeAddress } from "@superfunctions/extfn";

export interface RuntimeRequestEnvelope {
  v: 1;
  kind: "request";
  requestId: string;
  namespace: string;
  method: string;
  source: RuntimeAddress;
  target: RuntimeAddress;
  payload: unknown;
  timeoutMs?: number;
}

export interface RuntimeResponseEnvelope {
  v: 1;
  kind: "response";
  requestId: string;
  ok: boolean;
  result?: unknown;
  error?: ExtfnLikeError;
}

export interface RuntimeEventEnvelope {
  v: 1;
  kind: "event";
  namespace: string;
  event: string;
  source: RuntimeAddress;
  payload: unknown;
}

export interface ExtfnLikeError {
  code: string;
  message: string;
  status: number;
  retryable: boolean;
  details?: Record<string, unknown>;
}

const ALLOWED_DATAFN_EXTFN_OPTION_KEYS = new Set([
  "schema",
  "clientId",
  "namespace",
  "sync",
  "storage",
  "plugins",
  "searchProvider",
  "requestTimeoutMs",
]);

export function createExtfnLikeError(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): ExtfnLikeError {
  return {
    code,
    message,
    status: defaultStatusForCode(code),
    retryable: false,
    details,
  };
}

export function normalizeExtfnLikeError(error: unknown): ExtfnLikeError {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error
  ) {
    const candidate = error as {
      code: string;
      message: string;
      status?: number;
      retryable?: boolean;
      details?: Record<string, unknown>;
    };

    return {
      code: candidate.code,
      message: candidate.message,
      status: candidate.status ?? defaultStatusForCode(candidate.code),
      retryable: candidate.retryable ?? false,
      ...(candidate.details ? { details: candidate.details } : {}),
    };
  }

  return createExtfnLikeError(
    "E_RUNTIME_PROTOCOL",
    error instanceof Error ? error.message : "Runtime protocol failure.",
  );
}

export function assertValidDatafnExtfnOptionShape(options: unknown): void {
  if (typeof options !== "object" || options === null) {
    throw createExtfnLikeError(
      "E_CONFIG_INVALID",
      "@datafn/extfn options must be an object.",
    );
  }

  const optionRecord = options as Record<string, unknown>;
  for (const key of Object.keys(optionRecord)) {
    if (key === "authContext") {
      throw createExtfnLikeError(
        "E_CONFIG_INVALID",
        "@datafn/extfn option authContext is not part of the current public @datafn/client API.",
      );
    }

    if (!ALLOWED_DATAFN_EXTFN_OPTION_KEYS.has(key)) {
      throw createExtfnLikeError(
        "E_CONFIG_INVALID",
        `Unsupported @datafn/extfn option: ${key}`,
      );
    }
  }
}

export function createRequestEnvelope(
  input: Omit<RuntimeRequestEnvelope, "v" | "kind">,
): RuntimeRequestEnvelope {
  const envelope: RuntimeRequestEnvelope = {
    v: 1,
    kind: "request",
    ...input,
  };

  assertValidRequestEnvelope(envelope);
  return envelope;
}

export function createSuccessResponseEnvelope(
  requestId: string,
  result: unknown,
): RuntimeResponseEnvelope {
  return {
    v: 1,
    kind: "response",
    requestId,
    ok: true,
    result,
  };
}

export function createErrorResponseEnvelope(
  requestId: string,
  error: ExtfnLikeError,
): RuntimeResponseEnvelope {
  return {
    v: 1,
    kind: "response",
    requestId,
    ok: false,
    error,
  };
}

export function createEventEnvelope(
  input: Omit<RuntimeEventEnvelope, "v" | "kind">,
): RuntimeEventEnvelope {
  return {
    v: 1,
    kind: "event",
    ...input,
  };
}

export function assertValidRequestEnvelope(
  envelope: RuntimeRequestEnvelope,
): RuntimeRequestEnvelope {
  assertField(envelope.v === 1, "Request envelope is missing required field: v");
  assertField(
    envelope.kind === "request",
    "Request envelope is missing required field: kind",
  );
  assertField(
    typeof envelope.requestId === "string" && envelope.requestId.length > 0,
    "Request envelope is missing required field: requestId",
  );
  assertField(
    typeof envelope.namespace === "string" && envelope.namespace.length > 0,
    "Request envelope is missing required field: namespace",
  );
  assertField(
    typeof envelope.method === "string" && envelope.method.length > 0,
    "Request envelope is missing required field: method",
  );
  assertField(Boolean(envelope.source), "Request envelope is missing required field: source");
  assertField(Boolean(envelope.target), "Request envelope is missing required field: target");

  if (!("payload" in envelope)) {
    throw createExtfnLikeError(
      "E_RUNTIME_PROTOCOL",
      "Request envelope is missing required field: payload",
    );
  }

  return envelope;
}

export function toProxyId(address: RuntimeAddress): string {
  return [
    address.context,
    address.surfaceId ?? "surface",
    address.contentScriptId ?? "content",
    address.tabId ?? "tab",
    address.frameId ?? "frame",
  ].join(":");
}

function assertField(condition: boolean, message: string): void {
  if (!condition) {
    throw createExtfnLikeError("E_RUNTIME_PROTOCOL", message);
  }
}

function defaultStatusForCode(code: string): number {
  switch (code) {
    case "E_ENTRY_NOT_FOUND":
      return 404;
    case "E_HANDLER_NOT_FOUND":
      return 404;
    case "E_CONTEXT_UNAVAILABLE":
      return 503;
    case "E_TARGET_UNSUPPORTED":
      return 422;
    case "E_TIMEOUT":
      return 504;
    case "E_PAYLOAD_TOO_LARGE":
      return 413;
    case "E_PLUGIN_CONFLICT":
      return 409;
    case "E_RUNTIME_PROTOCOL":
      return 500;
    case "E_ANCHOR_RESOLUTION":
      return 500;
    case "E_MANIFEST_COLLISION":
    case "E_CONFIG_INVALID":
    default:
      return 400;
  }
}
