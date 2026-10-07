export class LangFnError extends Error {
  readonly code: string;
  readonly provider?: string;
  readonly metadata: Record<string, unknown>;

  constructor(
    message: string,
    options: {
      code: string;
      provider?: string;
      metadata?: Record<string, unknown>;
      cause?: unknown;
    }
  ) {
    super(
      message,
      Object.prototype.hasOwnProperty.call(options, "cause") ? { cause: options.cause } : undefined
    );
    this.name = this.constructor.name;
    this.code = options.code;
    this.provider = options.provider;
    this.metadata = options.metadata ?? {};
  }
}

export class ValidationError extends LangFnError {
  constructor(message = "Invalid request", options: Omit<ConstructorParameters<typeof LangFnError>[1], "code"> = {}) {
    super(message, { ...options, code: "VALIDATION_ERROR" });
  }
}

export class ProviderError extends LangFnError {
  constructor(message = "Provider request failed", options: Omit<ConstructorParameters<typeof LangFnError>[1], "code"> = {}) {
    super(message, { ...options, code: "PROVIDER_ERROR" });
  }
}

export class ProviderAuthError extends LangFnError {
  constructor(message = "Provider authentication failed", options: Omit<ConstructorParameters<typeof LangFnError>[1], "code"> = {}) {
    super(message, { ...options, code: "PROVIDER_AUTH" });
  }
}

export class RateLimitError extends LangFnError {
  readonly retryAfter?: number;

  constructor(
    message = "Provider rate limit exceeded",
    options: Omit<ConstructorParameters<typeof LangFnError>[1], "code" | "metadata"> & {
      retryAfter?: number;
      metadata?: Record<string, unknown>;
    } = {}
  ) {
    const retryAfter = options.retryAfter !== undefined
      && Number.isFinite(options.retryAfter)
      && options.retryAfter >= 0
      ? options.retryAfter
      : undefined;
    const metadata = { ...(options.metadata ?? {}) };
    if (retryAfter !== undefined) {
      metadata.retry_after = retryAfter;
    }
    super(message, { ...options, metadata, code: "PROVIDER_RATE_LIMIT" });
    this.retryAfter = retryAfter;
  }
}

export class TimeoutError extends LangFnError {
  constructor(message = "Provider request timed out", options: Omit<ConstructorParameters<typeof LangFnError>[1], "code"> = {}) {
    super(message, { ...options, code: "PROVIDER_TIMEOUT" });
  }
}

export class AbortError extends LangFnError {
  constructor(message = "Request cancelled", options: Omit<ConstructorParameters<typeof LangFnError>[1], "code"> = {}) {
    super(message, { ...options, code: "ABORT" });
  }
}

export class UnsupportedProviderError extends LangFnError {
  constructor(providerName: string) {
    super(`Unsupported provider: ${providerName}`, {
      code: "UNSUPPORTED_PROVIDER",
      metadata: { provider: providerName }
    });
  }
}

export class ToolExecutionError extends LangFnError {
  constructor(message = "Tool execution failed", options: Omit<ConstructorParameters<typeof LangFnError>[1], "code"> = {}) {
    super(message, { ...options, code: "TOOL_EXECUTION_ERROR" });
  }
}

export class ToolSchemaError extends LangFnError {
  constructor(message = "Tool schema validation failed", options: Omit<ConstructorParameters<typeof LangFnError>[1], "code"> = {}) {
    super(message, { ...options, code: "TOOL_SCHEMA_ERROR" });
  }
}

export class ToolDisabledError extends LangFnError {
  constructor(message = "Tool is disabled", options: Omit<ConstructorParameters<typeof LangFnError>[1], "code"> = {}) {
    super(message, { ...options, code: "TOOL_DISABLED" });
  }
}

export class ToolPolicyViolationError extends LangFnError {
  constructor(message = "Tool policy violation", options: Omit<ConstructorParameters<typeof LangFnError>[1], "code"> = {}) {
    super(message, { ...options, code: "TOOL_POLICY_VIOLATION" });
  }
}

export class NotConfiguredError extends LangFnError {
  constructor(message = "Required configuration is missing", options: Omit<ConstructorParameters<typeof LangFnError>[1], "code"> = {}) {
    super(message, { ...options, code: "NOT_CONFIGURED" });
  }
}

export class InternalError extends LangFnError {
  constructor(message = "Internal error", options: Omit<ConstructorParameters<typeof LangFnError>[1], "code"> = {}) {
    super(message, { ...options, code: "INTERNAL_ERROR" });
  }
}

export class GraphMaxStepsError extends LangFnError {
  constructor(message = "Graph exceeded max steps", options: Omit<ConstructorParameters<typeof LangFnError>[1], "code"> = {}) {
    super(message, { ...options, code: "GRAPH_MAX_STEPS" });
  }
}

export class AgentMaxIterationsError extends LangFnError {
  constructor(message = "Agent exceeded max iterations", options: Omit<ConstructorParameters<typeof LangFnError>[1], "code"> = {}) {
    super(message, { ...options, code: "AGENT_MAX_ITERATIONS" });
  }
}

export class GraphInterruptError extends LangFnError {
  constructor(message = "Graph interrupted", options: Omit<ConstructorParameters<typeof LangFnError>[1], "code"> = {}) {
    super(message, { ...options, code: "GRAPH_INTERRUPT" });
  }
}

export class NonProductionBackendError extends LangFnError {
  constructor(message = "Backend is not approved for production retrieval", options: Omit<ConstructorParameters<typeof LangFnError>[1], "code"> = {}) {
    super(message, { ...options, code: "NON_PRODUCTION_BACKEND" });
  }
}

export class TraceNotFoundError extends LangFnError {
  constructor(message = "Trace not found", options: Omit<ConstructorParameters<typeof LangFnError>[1], "code"> = {}) {
    super(message, { ...options, code: "TRACE_NOT_FOUND" });
  }
}

export class SchemaValidationError extends LangFnError {
  constructor(message = "Schema validation failed", options: Omit<ConstructorParameters<typeof LangFnError>[1], "code"> = {}) {
    super(message, { ...options, code: "SCHEMA_VALIDATION" });
  }
}

export class ContextLengthError extends LangFnError {
  constructor(message = "Context length exceeded", options: Omit<ConstructorParameters<typeof LangFnError>[1], "code"> = {}) {
    super(message, { ...options, code: "CONTEXT_LENGTH" });
  }
}

export class MCPTransportError extends LangFnError {
  constructor(message = "MCP transport failed", options: Omit<ConstructorParameters<typeof LangFnError>[1], "code"> = {}) {
    super(message, { ...options, code: "MCP_TRANSPORT_ERROR" });
  }
}

export class MCPProtocolError extends LangFnError {
  constructor(message = "MCP protocol error", options: Omit<ConstructorParameters<typeof LangFnError>[1], "code"> = {}) {
    super(message, { ...options, code: "MCP_PROTOCOL_ERROR" });
  }
}
