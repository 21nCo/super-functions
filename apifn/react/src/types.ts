/**
 * Shared types for @apifn/react components.
 */

import type { OpenAPIDocument, OperationObject, SchemaObject } from "@apifn/core";
export type { OpenAPIDocument, OperationObject, SchemaObject };

export type Theme = "light" | "dark" | "auto";

export interface HistoryEntry {
    id: string;
    timestamp: number;
    method: string;
    url: string;
    statusCode?: number;
    duration?: number;
    requestBody?: unknown;
    responseBody?: unknown;
    responseHeaders?: Record<string, string>;
    error?: string;
}

export interface PerformanceMetrics {
    endpoint: string;
    method: string;
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    errorRatePct: number;
    requestsPerMinute: number;
    lastUpdated: string;
}

export interface AuthConfig {
    type: "none" | "bearer" | "apikey" | "basic";
    token?: string;
    key?: string;
    keyName?: string;
    keyIn?: "header" | "query";
    username?: string;
    password?: string;
}

export interface TryItResponse {
    statusCode: number;
    statusText: string;
    headers: Record<string, string>;
    body: unknown;
    durationMs: number;
}
