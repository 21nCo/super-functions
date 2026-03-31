import { SearchAdapterError } from "@searchfn/adapter-contracts";
import { redactSensitive } from "./redaction";

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function internalError(message: string): SearchAdapterError {
  return new SearchAdapterError("INTERNAL", message);
}

export function forbiddenError(message: string): SearchAdapterError {
  return new SearchAdapterError("FORBIDDEN", message);
}

export function abortedError(message = "Operation aborted"): SearchAdapterError {
  return new SearchAdapterError("DFQL_ABORTED", message);
}

export function retryBudgetExhaustedError(): SearchAdapterError {
  return new SearchAdapterError("INTERNAL", "Retry budget exhausted");
}

export function withRedactedErrorMessage(prefix: string, error: unknown): SearchAdapterError {
  const message = redactSensitive(toErrorMessage(error));
  return new SearchAdapterError("INTERNAL", `${prefix}: ${message}`);
}
