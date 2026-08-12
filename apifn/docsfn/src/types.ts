/**
 * docsfn integration types for @apifn/docsfn.
 *
 * docsfn is an optional peer dependency that may not be installed.
 * We define the minimal interfaces needed for our provider here so
 * consumers get correct types even without the full docsfn package.
 */

import type { OpenAPIDocument, OperationObject } from "@apifn/core";
export type { OpenAPIDocument, OperationObject };

// ─── docsfn content types ────────────────────────────────────────────────────

/** Sidebar leaf link. */
export interface SidebarLink {
    type: "link";
    label: string;
    href: string;
}

/** Sidebar group containing links. */
export interface SidebarGroup {
    type: "group";
    label: string;
    items: Array<SidebarLink | SidebarGroup>;
}

export type SidebarItem = SidebarLink | SidebarGroup;

/** A processed endpoint grouped in a docsfn page. */
export interface ApiEndpoint {
    path: string;
    method: string;
    operation: OperationObject;
    tag: string;
}

/**
 * A single raw content entry produced by a DocsContentProvider.
 * `kind: "api"` signals to docsfn that this is an API reference page.
 */
export interface RawContentEntry {
    kind: "api";
    /** URL slug for this page (e.g. "/api/users") */
    slug: string;
    /** Human-readable page title */
    title: string;
    /** Tag name when split by tag */
    tag?: string;
    /** Endpoint list for this page */
    endpoints: ApiEndpoint[];
    /** Sidebar items generated for this entry */
    sidebar: SidebarGroup;
    /** Full OpenAPI spec (so renderers can look up $refs etc.) */
    spec: OpenAPIDocument;
    /** Optional Try-It base URL supplied by the provider */
    baseUrl?: string;
}

/** A DocsContentProvider is a callable that returns RawContentEntry[]. */
export interface DocsContentProvider {
    (): Promise<RawContentEntry[]>;
    entries: RawContentEntry[];
}

// ─── createApifnProvider options ─────────────────────────────────────────────

export interface CreateApifnProviderOptions {
    /** OpenAPI document (object) */
    spec?: OpenAPIDocument;
    /** File path to a JSON or YAML OpenAPI spec */
    specPath?: string;
    /** Base path prefix for slug generation (default: "/api") */
    basePath?: string;
    /**
     * Split the spec into one page per tag.
     * - `true`  → one RawContentEntry per tag
     * - `false` → one RawContentEntry with all endpoints
     * @default true
     */
    splitByTag?: boolean;
    /** Optional base URL to embed in entries (for TryIt) */
    baseUrl?: string;
}

// ─── ApifnApiReference component props ───────────────────────────────────────

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

export interface ApifnApiReferenceProps {
    /** Single content entry from createApifnProvider */
    entry: RawContentEntry;
    /** Show embedded Try-It console per endpoint (DOCS-005) */
    tryIt?: boolean;
    /** Base URL for Try-It requests */
    baseUrl?: string;
    /** Theme for the embedded components */
    theme?: "light" | "dark" | "auto";
    /** Optional watchfn metrics per endpoint key ("METHOD /path") */
    performanceMetrics?: Record<string, Omit<PerformanceMetrics, "endpoint" | "method" | "lastUpdated">>;
}
