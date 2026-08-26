import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

export type McpFnDiagnosticPhase =
  | "resource-discovery"
  | "authorization-server-discovery"
  | "client-registration"
  | "authorization-request"
  | "authorization-callback"
  | "token-exchange"
  | "token-refresh"
  | "token-revocation"
  | "transport-connect"
  | "mcp-initialize"
  | "capability-operation"
  | "transport-close";

export type McpFnDiagnosticOutcome = "started" | "succeeded" | "failed";

export interface McpFnTargetDescriptor extends Record<string, unknown> {
  kind: string;
}

export interface McpFnDiagnosticEvent {
  phase: McpFnDiagnosticPhase;
  outcome: McpFnDiagnosticOutcome;
  code?: string;
  requestId: string;
  at: string;
  target: McpFnTargetDescriptor;
  details?: Record<string, unknown>;
}

export type McpFnDiagnosticSink = (
  event: McpFnDiagnosticEvent,
) => void | Promise<void>;

export interface McpFnTargetContext {
  requestId: string;
  signal?: AbortSignal;
  diagnostic: McpFnDiagnosticSink;
}

export interface McpFnTransportHandle {
  transport: Transport;
  finishAuthorization?(authorizationCode: string, state?: string): Promise<void>;
  terminateSession?(): Promise<void>;
  close?(): Promise<void>;
}

/** A target opens an official-SDK transport; it never implements MCP itself. */
export interface McpFnTarget {
  readonly kind: string;
  describe(): McpFnTargetDescriptor;
  open(context: McpFnTargetContext): Promise<McpFnTransportHandle>;
}

export type McpFnClientState =
  | "idle"
  | "connecting"
  | "authorization-required"
  | "connected"
  | "closing"
  | "closed";

export type McpFnClientErrorCode =
  | "MCPFN_AUTHORIZATION_REQUIRED"
  | "MCPFN_AUTH_CALLBACK_UNSUPPORTED"
  | "MCPFN_AUTH_CALLBACK_FAILED"
  | "MCPFN_CLIENT_NOT_CONNECTED"
  | "MCPFN_CONNECT_ABORTED"
  | "MCPFN_CONNECT_FAILED"
  | "MCPFN_OPERATION_FAILED"
  | "MCPFN_TARGET_OPEN_FAILED";

export class McpFnClientError extends Error {
  readonly code: McpFnClientErrorCode | string;
  readonly phase: McpFnDiagnosticPhase;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(
    code: McpFnClientErrorCode | string,
    message: string,
    options: {
      phase: McpFnDiagnosticPhase;
      retryable?: boolean;
      details?: Record<string, unknown>;
      cause?: unknown;
    },
  ) {
    super(message, { cause: options.cause });
    this.name = "McpFnClientError";
    this.code = code;
    this.phase = options.phase;
    this.retryable = options.retryable ?? false;
    this.details = options.details;
  }
}

export type McpFnConfigureClient = (
  client: Client,
) => void | Promise<void>;
