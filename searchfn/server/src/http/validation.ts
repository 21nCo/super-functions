/**
 * Request validation utilities for @searchfn/server
 */

import { errorResponse } from "./errors.js";

export interface ServerLimits {
  maxPayloadBytes: number;
  maxQueryLength: number;
  maxResourcesPerSearchAll: number;
  maxLimit: number;
  maxLimitPerResource: number;
  maxIndexBatch: number;
}

export const DEFAULT_LIMITS: ServerLimits = {
  maxPayloadBytes: 1_048_576,
  maxQueryLength: 1000,
  maxResourcesPerSearchAll: 50,
  maxLimit: 10_000,
  maxLimitPerResource: 1_000,
  maxIndexBatch: 10_000,
};

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function validateObjectBody(
  body: unknown,
): { value: Record<string, unknown>; error: Response | null } {
  if (!isPlainObject(body)) {
    return {
      value: {},
      error: errorResponse("DFQL_INVALID", "request body must be a JSON object", {
        path: "$",
      }),
    };
  }
  return {
    value: body,
    error: null,
  };
}

export function validateResource(
  resource: unknown,
): Response | null {
  if (typeof resource !== "string" || resource.trim() === "") {
    return errorResponse("DFQL_INVALID", "resource must be a non-empty string", {
      path: "resource",
    });
  }
  return null;
}

export function validateQuery(
  query: unknown,
  limits: ServerLimits,
): Response | null {
  if (typeof query !== "string" || query.trim() === "") {
    return errorResponse("DFQL_INVALID", "Search query must not be empty", {
      path: "query",
    });
  }
  if (query.length > limits.maxQueryLength) {
    return errorResponse("LIMIT_EXCEEDED", "query exceeds maximum length", {
      path: "query",
      max: limits.maxQueryLength,
    });
  }
  return null;
}

export function validateLimit(
  limit: unknown,
  max: number,
  fieldName = "limit",
): { value: number; error: Response | null } {
  if (limit === undefined || limit === null) {
    return { value: max, error: null };
  }
  if (typeof limit !== "number" || !Number.isFinite(limit) || limit < 1) {
    return {
      value: 0,
      error: errorResponse("DFQL_INVALID", `${fieldName} must be a positive number`, {
        path: fieldName,
      }),
    };
  }
  if (limit > max) {
    return {
      value: 0,
      error: errorResponse("LIMIT_EXCEEDED", `${fieldName} exceeds maximum`, {
        path: fieldName,
        max,
      }),
    };
  }
  return { value: limit, error: null };
}

export function validateIds(
  ids: unknown,
): Response | null {
  if (!Array.isArray(ids) || ids.length === 0) {
    return errorResponse("DFQL_INVALID", "ids must be a non-empty array", {
      path: "ids",
    });
  }
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (typeof id !== "string" && typeof id !== "number") {
      return errorResponse("DFQL_INVALID", "each id must be a string or number", {
        path: `ids[${i}]`,
      });
    }
  }
  return null;
}

export function validateDocuments(
  documents: unknown,
  limits: ServerLimits,
): Response | null {
  if (!Array.isArray(documents) || documents.length === 0) {
    return errorResponse("DFQL_INVALID", "documents must be a non-empty array", {
      path: "documents",
    });
  }
  if (documents.length > limits.maxIndexBatch) {
    return errorResponse("LIMIT_EXCEEDED", "documents batch exceeds maximum", {
      path: "documents",
      max: limits.maxIndexBatch,
    });
  }
  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    if (!doc || typeof doc !== "object") {
      return errorResponse("DFQL_INVALID", "each document must be an object", {
        path: `documents[${i}]`,
      });
    }
    if (doc.id === undefined || doc.id === null) {
      return errorResponse("DFQL_INVALID", "each document must have an id", {
        path: `documents[${i}].id`,
      });
    }
    if (!doc.fields || typeof doc.fields !== "object") {
      return errorResponse("DFQL_INVALID", "each document must have fields object", {
        path: `documents[${i}].fields`,
      });
    }
  }
  return null;
}

export function validateResourcesArray(
  resources: unknown,
  limits: ServerLimits,
): Response | null {
  if (resources === undefined || resources === null) {
    return null; // optional
  }
  if (!Array.isArray(resources)) {
    return errorResponse("DFQL_INVALID", "resources must be an array", {
      path: "resources",
    });
  }
  if (resources.length > limits.maxResourcesPerSearchAll) {
    return errorResponse("LIMIT_EXCEEDED", "resources array exceeds maximum", {
      path: "resources",
      max: limits.maxResourcesPerSearchAll,
    });
  }
  for (let i = 0; i < resources.length; i++) {
    if (typeof resources[i] !== "string" || resources[i].trim() === "") {
      return errorResponse("DFQL_INVALID", "each resource must be a non-empty string", {
        path: `resources[${i}]`,
      });
    }
  }
  return null;
}

export function validateFields(
  fields: unknown,
): Response | null {
  if (fields === undefined || fields === null) {
    return null;
  }
  if (!Array.isArray(fields)) {
    return errorResponse("DFQL_INVALID", "fields must be an array", {
      path: "fields",
    });
  }
  for (let i = 0; i < fields.length; i++) {
    if (typeof fields[i] !== "string" || fields[i].trim() === "") {
      return errorResponse("DFQL_INVALID", "each field must be a non-empty string", {
        path: `fields[${i}]`,
      });
    }
  }
  return null;
}

export function validateFieldBoosts(
  fieldBoosts: unknown,
): Response | null {
  if (fieldBoosts === undefined || fieldBoosts === null) {
    return null;
  }
  if (!isPlainObject(fieldBoosts)) {
    return errorResponse("DFQL_INVALID", "fieldBoosts must be an object", {
      path: "fieldBoosts",
    });
  }
  for (const [field, boost] of Object.entries(fieldBoosts)) {
    if (typeof boost !== "number" || !Number.isFinite(boost) || boost <= 0) {
      return errorResponse("DFQL_INVALID", "fieldBoosts values must be positive numbers", {
        path: `fieldBoosts.${field}`,
      });
    }
  }
  return null;
}

export function validateFuzzy(
  fuzzy: unknown,
): Response | null {
  if (fuzzy === undefined || fuzzy === null) {
    return null;
  }
  if (typeof fuzzy === "boolean") {
    return null;
  }
  if (typeof fuzzy === "number" && Number.isFinite(fuzzy) && fuzzy >= 0) {
    return null;
  }
  return errorResponse("DFQL_INVALID", "fuzzy must be a boolean or non-negative number", {
    path: "fuzzy",
  });
}

export function validatePrefix(
  prefix: unknown,
): Response | null {
  if (prefix === undefined || prefix === null || typeof prefix === "boolean") {
    return null;
  }
  return errorResponse("DFQL_INVALID", "prefix must be a boolean", {
    path: "prefix",
  });
}
