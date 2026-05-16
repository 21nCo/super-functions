/**
 * @apifn/svelte — public API
 *
 * Svelte components are shipped as source (.svelte files) and must be
 * processed by the consuming app's Svelte compiler.
 * This index.ts provides types for TypeScript consumers.
 */

// Re-export types from @apifn/core for convenience
export type { OpenAPIDocument, OperationObject, SchemaObject } from "@apifn/core";

// Component prop types (manually mirrored from .svelte files for DTS consumers)
export interface ApiExplorerProps {
    spec: import("@apifn/core").OpenAPIDocument;
    baseUrl?: string;
    theme?: "light" | "dark" | "auto";
    showHistory?: boolean;
}

export interface EndpointViewerProps {
    path: string;
    method: string;
    operation: import("@apifn/core").OperationObject;
}

export interface SchemaViewerProps {
    schema: import("@apifn/core").SchemaObject;
    name?: string;
    required?: boolean;
    expandDepth?: number;
    depth?: number;
}

export interface TryItProps {
    path: string;
    method: string;
    operation: import("@apifn/core").OperationObject;
    baseUrl?: string;
}

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

export interface RequestHistoryProps {
    entries: HistoryEntry[];
    maxEntries?: number;
}

export interface TryItResponse {
    statusCode: number;
    statusText: string;
    headers: Record<string, string>;
    body: unknown;
    durationMs: number;
}

export interface ResponseDiffProps {
    left: TryItResponse;
    right: TryItResponse;
    leftLabel?: string;
    rightLabel?: string;
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

export interface PerformanceOverlayProps {
    metrics: PerformanceMetrics;
    compact?: boolean;
}
