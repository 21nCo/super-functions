export class SecFnError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "SecFnError";
  }
}

export class SecFnConfigError extends SecFnError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "SECFN_CONFIG_INVALID", details);
    this.name = "SecFnConfigError";
  }
}

export class SecFnUnauthorizedError extends SecFnError {
  constructor(message = "Unauthorized", details?: Record<string, unknown>) {
    super(message, "SECFN_UNAUTHORIZED", details);
    this.name = "SecFnUnauthorizedError";
  }
}

export class SecFnForbiddenError extends SecFnError {
  constructor(message = "Forbidden", details?: Record<string, unknown>) {
    super(message, "SECFN_FORBIDDEN", details);
    this.name = "SecFnForbiddenError";
  }
}

export class SecFnNotFoundError extends SecFnError {
  constructor(message = "Not found", details?: Record<string, unknown>) {
    super(message, "SECFN_NOT_FOUND", details);
    this.name = "SecFnNotFoundError";
  }
}

export class SecFnValidationError extends SecFnError {
  constructor(message = "Invalid input", details?: Record<string, unknown>) {
    super(message, "SECFN_VALIDATION_FAILED", details);
    this.name = "SecFnValidationError";
  }
}

export class SecFnEncryptionError extends SecFnError {
  constructor(message = "Secret encryption failed", details?: Record<string, unknown>) {
    super(message, "SECFN_ENCRYPTION_FAILED", details);
    this.name = "SecFnEncryptionError";
  }
}
