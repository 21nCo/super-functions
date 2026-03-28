/**
 * Error classification and handling for execution errors
 * Converts execution errors to deterministic DatafnError objects
 */

import type { DatafnErrorCode } from "../core-types.js";

export interface DatafnError {
  code: DatafnErrorCode;
  message: string;
  details: { path: string; [key: string]: unknown };
}

/**
 * Classify an execution error into a deterministic DatafnError
 */
export function classifyExecutionError(error: unknown): DatafnError {
  // EXE-005: Check DatafnExecutionError first — has machine-readable code, no message matching needed
  if (error instanceof DatafnExecutionError) {
    return error.toDatafnError();
  }

  // If it's already a DatafnError-shaped object, return it
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    "message" in error &&
    "details" in error
  ) {
    return error as DatafnError;
  }

  // If it's an Error object, check the message for known patterns
  if (error instanceof Error) {
    const message = error.message;

    // Validation errors (should bubble from validation layer)
    if (message.includes("Unknown resource:")) {
      return {
        code: "DFQL_UNKNOWN_RESOURCE",
        message,
        details: { path: "resource" },
      };
    }

    if (message.includes("Unknown field:")) {
      return {
        code: "DFQL_UNKNOWN_FIELD",
        message,
        details: { path: "$" },
      };
    }

    if (message.includes("Unknown relation:")) {
      return {
        code: "DFQL_UNKNOWN_RELATION",
        message,
        details: { path: "$" },
      };
    }

    // Query-specific validation errors
    if (message.includes("Unknown filter operator:")) {
      // Extract field name if possible
      const match = message.match(/operator: (\w+)/);
      return {
        code: "DFQL_INVALID",
        message,
        details: { path: "filters" },
      };
    }

    if (message.includes("Invalid cursor") || message.includes("cursor requires")) {
      return {
        code: "DFQL_INVALID",
        message,
        details: { path: "cursor" },
      };
    }

    if (message.includes("Invalid sort") || message.includes("Unknown sort field")) {
      return {
        code: "DFQL_UNKNOWN_FIELD",
        message,
        details: { path: "sort" },
      };
    }

    // DFQL validation errors
    if (message.includes("Invalid DFQL")) {
      return {
        code: "DFQL_INVALID",
        message,
        details: { path: "$" },
      };
    }

    // Unsupported features
    if (message.includes("Unsupported DFQL feature")) {
      return {
        code: "DFQL_UNSUPPORTED",
        message,
        details: { path: "$" },
      };
    }

    // Record not found
    if (message.includes("not found") || message.includes("NOT_FOUND")) {
      return {
        code: "NOT_FOUND",
        message,
        details: { path: "$" },
      };
    }

    // Guard conflicts
    if (message.includes("Guard") || message.includes("guard")) {
      return {
        code: "CONFLICT",
        message,
        details: { path: "if" },
      };
    }

    // Default to INTERNAL for unclassified errors
    return {
      code: "INTERNAL",
      message: error.message || "Internal error",
      details: { path: "$" },
    };
  }

  // Non-Error objects
  if (typeof error === "string") {
    return {
      code: "INTERNAL",
      message: error,
      details: { path: "$" },
    };
  }

  // Unknown error type
  return {
    code: "INTERNAL",
    message: "Internal error",
    details: { path: "$" },
  };
}

/**
 * Create a DFQL validation error
 */
export function createDfqlError(
  code: DatafnErrorCode,
  message: string,
  path: string = "$",
  extra?: Record<string, unknown>,
): DatafnError {
  return {
    code,
    message,
    details: { path, ...extra },
  };
}

/**
 * Check if an error is a validation error (should bubble through)
 */
export function isValidationError(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return false;
  }

  const code = (error as any).code;
  return (
    code === "DFQL_UNKNOWN_RESOURCE" ||
    code === "DFQL_UNKNOWN_FIELD" ||
    code === "DFQL_UNKNOWN_RELATION" ||
    code === "DFQL_INVALID" ||
    code === "DFQL_UNSUPPORTED"
  );
}

/**
 * Throw a classified error
 */
export class DatafnExecutionError extends Error {
  code: DatafnErrorCode;
  details: { path: string; [key: string]: unknown };

  constructor(code: DatafnErrorCode, message: string, path: string = "$", extra?: Record<string, unknown>) {
    super(message);
    this.name = "DatafnExecutionError";
    this.code = code;
    this.details = { path, ...extra };
  }

  toDatafnError(): DatafnError {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}
