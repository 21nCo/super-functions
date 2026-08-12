/**
 * ApiExplorer — full API explorer shell (UI-R-001).
 *
 * Layout: sidebar (endpoint list + search + tag groups) + main area (EndpointViewer + TryIt).
 * Theming (light/dark/auto) via CSS variables.
 * Responsive: sidebar collapses to hamburger on mobile (≤768px).
 */

import React, { useState, useMemo, useCallback, useEffect } from "react";
import type { OpenAPIDocument, OperationObject, Theme, HistoryEntry } from "./types.js";
import { EndpointViewer } from "./EndpointViewer.js";
import { TryIt } from "./TryIt.js";
import { RequestHistory } from "./RequestHistory.js";
import { PerformanceOverlay } from "./PerformanceOverlay.js";
import { getThemeStyle, METHOD_COLORS } from "./styles/tokens.js";
import type { TryItResponse } from "./types.js";
import type { EndpointMetrics, RateLimitInfo } from "@apifn/core";

export interface ApiExplorerProps {
    /** OpenAPI document to render */
    spec: OpenAPIDocument;
    /** Base URL for TryIt requests (falls back to spec.servers[0].url) */
    baseUrl?: string;
    /** Light / dark / auto (default: auto) */
    theme?: Theme;
    /** Show request history panel */
    showHistory?: boolean;
    /** Optional watchfn client for performance metrics */
    watchfn?: import("@apifn/core").WatchFnClient;
    /** Polling interval for watchfn metrics in ms (default: 10000) */
    watchfnInterval?: number;
    /** Optional secfn rate limits mapping (e.g. "GET /path" -> RateLimitInfo) */
    rateLimits?: Record<string, RateLimitInfo>;
    /** Custom class name */
    className?: string;
}

const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options"] as const;

interface EndpointItem {
    path: string;
    method: string;
    operation: OperationObject;
    tag: string;
}

function collectEndpoints(spec: OpenAPIDocument): EndpointItem[] {
    const items: EndpointItem[] = [];
    for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
        if (!pathItem) continue;
        for (const method of HTTP_METHODS) {
            const op = pathItem[method] as OperationObject | undefined;
            if (!op) continue;
            const tags = (op.tags as string[]) ?? ["default"];
            items.push({ path, method, operation: op, tag: tags[0] ?? "default" });
        }
    }
    return items;
}

// ─── Styled helpers ───────────────────────────────────────────────────────────

const SIDEBAR_W = "280px";

const s = {
    root: {
        fontFamily: "var(--apifn-font-sans)",
        background: "var(--apifn-bg)",
        color: "var(--apifn-text)",
        display: "flex",
        flexDirection: "column" as const,
        height: "100vh",
        overflow: "hidden",
    } as React.CSSProperties,
    topbar: {
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "0 20px",
        height: "52px",
        borderBottom: "1px solid var(--apifn-border)",
        background: "var(--apifn-bg-surface)",
        flexShrink: 0,
    } as React.CSSProperties,
    logo: {
        fontSize: "16px",
        fontWeight: 800,
        color: "var(--apifn-accent)",
        letterSpacing: "-0.5px",
    } as React.CSSProperties,
    apiTitle: {
        fontSize: "14px",
        color: "var(--apifn-text-muted)",
        flex: 1,
    } as React.CSSProperties,
    version: {
        fontSize: "11px",
        padding: "2px 8px",
        borderRadius: "12px",
        background: "var(--apifn-accent)22",
        color: "var(--apifn-accent-text)",
        border: "1px solid var(--apifn-accent)44",
    } as React.CSSProperties,
    hamburger: {
        background: "none",
        border: "none",
        color: "var(--apifn-text)",
        cursor: "pointer",
        fontSize: "20px",
        padding: "4px",
        display: "none" as const,
    } as React.CSSProperties,
    body: {
        display: "flex",
        flex: 1,
        overflow: "hidden",
    } as React.CSSProperties,
    sidebar: (open: boolean): React.CSSProperties => ({
        width: SIDEBAR_W,
        minWidth: SIDEBAR_W,
        borderRight: "1px solid var(--apifn-border)",
        background: "var(--apifn-bg-surface)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        flexShrink: 0,
        transition: "transform 0.2s ease",
    }),
    search: {
        margin: "12px",
        padding: "8px 12px",
        background: "var(--apifn-bg)",
        border: "1px solid var(--apifn-border)",
        borderRadius: "var(--apifn-radius)",
        color: "var(--apifn-text)",
        fontSize: "13px",
        fontFamily: "var(--apifn-font-sans)",
        outline: "none",
        width: "calc(100% - 24px)",
    } as React.CSSProperties,
    endpointList: {
        flex: 1,
        overflowY: "auto" as const,
        padding: "4px 0",
    } as React.CSSProperties,
    tagGroup: {
        marginBottom: "4px",
    } as React.CSSProperties,
    tagHeader: {
        fontSize: "11px",
        fontWeight: 700,
        textTransform: "uppercase" as const,
        letterSpacing: "0.06em",
        color: "var(--apifn-text-muted)",
        padding: "8px 12px 4px",
    } as React.CSSProperties,
    endpointRow: (active: boolean): React.CSSProperties => ({
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "7px 12px",
        cursor: "pointer",
        background: active ? "var(--apifn-bg-surface-hover)" : "transparent",
        borderLeft: active ? "2px solid var(--apifn-accent)" : "2px solid transparent",
    }),
    methodTag: (method: string): React.CSSProperties => {
        const c = METHOD_COLORS[method.toLowerCase()] ?? { bg: "#2d3748", text: "#9ca3af" };
        return { fontSize: "10px", fontWeight: 700, padding: "1px 5px", borderRadius: "3px", background: c.bg, color: c.text, fontFamily: "var(--apifn-font-mono)", minWidth: "40px", textAlign: "center", textTransform: "uppercase" };
    },
    endpointPath: {
        fontFamily: "var(--apifn-font-mono)",
        fontSize: "12px",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap" as const,
    } as React.CSSProperties,
    main: {
        flex: 1,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column" as const,
    } as React.CSSProperties,
    tabs: {
        display: "flex",
        borderBottom: "1px solid var(--apifn-border)",
        background: "var(--apifn-bg-surface)",
        padding: "0 20px",
        gap: "0",
        flexShrink: 0,
    } as React.CSSProperties,
    tab: (active: boolean): React.CSSProperties => ({
        padding: "12px 16px",
        fontSize: "13px",
        fontWeight: active ? 600 : 400,
        color: active ? "var(--apifn-text)" : "var(--apifn-text-muted)",
        borderBottom: active ? "2px solid var(--apifn-accent)" : "2px solid transparent",
        cursor: "pointer",
        background: "none",
        border: "none",
        borderBottomWidth: "2px",
        borderBottomStyle: "solid",
        borderBottomColor: active ? "var(--apifn-accent)" : "transparent",
    }),
    content: {
        flex: 1,
        overflowY: "auto" as const,
    } as React.CSSProperties,
    empty: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        color: "var(--apifn-text-muted)",
        fontSize: "14px",
        flexDirection: "column" as const,
        gap: "12px",
    } as React.CSSProperties,
    perfBadge: { fontSize: "11px", fontWeight: 600, padding: "2px 8px", background: "var(--apifn-bg-surface-hover)", borderRadius: "12px", color: "var(--apifn-text-muted)" } as React.CSSProperties,
    rateLimitBadge: { fontSize: "10px", fontWeight: 600, padding: "2px 6px", background: "var(--apifn-bg-surface)", border: "1px solid var(--apifn-border)", borderRadius: "4px", color: "var(--apifn-text-muted)", whiteSpace: "nowrap" as const } as React.CSSProperties,
};

type MainTab = "docs" | "tryit" | "perf" | "history";

export function ApiExplorer({ spec, theme = "auto", baseUrl, showHistory = true, watchfn, watchfnInterval = 10000, rateLimits, className }: ApiExplorerProps): React.ReactElement {
    const [query, setQuery] = useState("");
    const [selected, setSelected] = useState<EndpointItem | null>(null);
    const [tab, setTab] = useState<MainTab>("docs");
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [isMobile, setIsMobile] = useState(false);
    const [metrics, setMetrics] = useState<Record<string, EndpointMetrics>>({});

    // Detect mobile viewport
    useEffect(() => {
        const mq = window.matchMedia("(max-width: 768px)");
        const handler = (e: MediaQueryListEvent) => {
            setIsMobile(e.matches);
            setSidebarOpen(!e.matches);
        };
        setIsMobile(mq.matches);
        setSidebarOpen(!mq.matches);
        mq.addEventListener("change", handler);
        return () => mq.removeEventListener("change", handler);
    }, []);

    const title = (spec.info as { title?: string })?.title ?? "API Explorer";
    const version = (spec.info as { version?: string })?.version ?? "1.0.0";

    const endpoints = useMemo(() => collectEndpoints(spec), [spec]);

    const filtered = useMemo(() => {
        const q = query.toLowerCase();
        if (!q) return endpoints;
        return endpoints.filter(
            (e) => e.path.toLowerCase().includes(q) || e.method.toLowerCase().includes(q) || ((e.operation.summary as string) ?? "").toLowerCase().includes(q)
        );
    }, [endpoints, query]);

    // Group by tag
    const grouped = useMemo(() => {
        const map = new Map<string, EndpointItem[]>();
        for (const e of filtered) {
            if (!map.has(e.tag)) map.set(e.tag, []);
            map.get(e.tag)!.push(e);
        }
        return map;
    }, [filtered]);

    const effectiveBaseUrl = baseUrl ?? (spec as { servers?: Array<{ url: string }> }).servers?.[0]?.url ?? "https://api.example.com";

    // Metrics polling
    useEffect(() => {
        if (!watchfn) return;

        let mounted = true;
        let timer: ReturnType<typeof setTimeout>;

        async function poll() {
            if (!watchfn || !mounted) return;
            try {
                const list = await watchfn.fetchMetrics({ timeRange: "PT1H" });
                if (!mounted) return;
                const m: Record<string, EndpointMetrics> = {};
                for (const item of list) {
                    m[`${item.method.toUpperCase()} ${item.path}`] = item;
                }
                setMetrics(m);
            } catch (err) {
                console.warn("[ApiExplorer] Failed to fetch watchfn metrics:", err);
            }
            if (mounted) {
                timer = setTimeout(poll, watchfnInterval);
            }
        }

        poll();
        return () => {
            mounted = false;
            clearTimeout(timer);
        };
    }, [watchfn, watchfnInterval]);

    const handleResponse = useCallback((response: TryItResponse) => {
        if (!selected) return;
        setHistory((h) => [{
            id: `${Date.now()}-${Math.random()}`,
            timestamp: Date.now(),
            method: selected.method,
            url: `${effectiveBaseUrl}${selected.path}`,
            statusCode: response.statusCode,
            duration: response.durationMs,
            responseBody: response.body,
            responseHeaders: response.headers,
        }, ...h].slice(0, 500));
    }, [selected, effectiveBaseUrl]);

    // Theme injection
    const themeStyle = useMemo(() => getThemeStyle(theme), [theme]);

    return (
        <div className={`apifn-root ${className ?? ""}`} style={s.root}>
            <style>{themeStyle}</style>

            {/* Top Bar */}
            <div style={s.topbar}>
                <button
                    style={{ ...s.hamburger, display: isMobile ? "block" : "none" }}
                    onClick={() => setSidebarOpen((o) => !o)}
                    aria-label="Toggle sidebar"
                >
                    ☰
                </button>
                <span style={s.logo}>ApiFn</span>
                <span style={s.apiTitle}>{title}</span>
                <span style={s.version}>v{version}</span>
            </div>

            {/* Body */}
            <div style={s.body}>
                {/* Sidebar */}
                {sidebarOpen && (
                    <div style={s.sidebar(sidebarOpen)}>
                        <input
                            style={s.search}
                            placeholder="Search endpoints…"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            aria-label="Search endpoints"
                        />
                        <div style={s.endpointList}>
                            {filtered.length === 0 && (
                                <div style={{ padding: "20px", color: "var(--apifn-text-muted)", fontSize: "13px", textAlign: "center" }}>
                                    No endpoints match
                                </div>
                            )}
                            {[...grouped.entries()].map(([tag, items]) => (
                                <div key={tag} style={s.tagGroup}>
                                    <div style={s.tagHeader}>{tag}</div>
                                    {items.map((item) => {
                                        const isActive = selected?.path === item.path && selected?.method === item.method;
                                        return (
                                            <div
                                                key={`${item.method}-${item.path}`}
                                                style={s.endpointRow(isActive)}
                                                onClick={() => {
                                                    setSelected(item);
                                                    setTab("docs");
                                                    if (isMobile) setSidebarOpen(false);
                                                }}
                                                role="button"
                                                tabIndex={0}
                                            >
                                                <span style={s.methodTag(item.method)}>{item.method}</span>
                                                <span style={s.endpointPath}>{item.path}</span>
                                                {metrics[`${item.method.toUpperCase()} ${item.path}`] && (
                                                    <span style={s.perfBadge} title="Performance data available">⚡</span>
                                                )}
                                                {rateLimits && rateLimits[`${item.method.toUpperCase()} ${item.path}`] && (
                                                    <span style={{
                                                        ...s.rateLimitBadge,
                                                        color: rateLimits[`${item.method.toUpperCase()} ${item.path}`].remaining / rateLimits[`${item.method.toUpperCase()} ${item.path}`].limit < 0.1 ? "var(--apifn-red)" : s.rateLimitBadge.color
                                                    }} title={`Rate Limit: ${rateLimits[`${item.method.toUpperCase()} ${item.path}`].remaining}/${rateLimits[`${item.method.toUpperCase()} ${item.path}`].limit}`}>
                                                        {rateLimits[`${item.method.toUpperCase()} ${item.path}`].remaining}/{rateLimits[`${item.method.toUpperCase()} ${item.path}`].limit}
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Main Area */}
                <div style={s.main}>
                    {selected ? (
                        <>
                            {/* Tabs */}
                            <div style={s.tabs}>
                                {(["docs", "tryit", ...(watchfn ? ["perf"] : []), ...(showHistory ? ["history"] : [])] as MainTab[]).map((t) => (
                                    <button key={t} style={s.tab(tab === t)} onClick={() => setTab(t)}>
                                        {t === "docs" ? "Documentation" : t === "tryit" ? "Try It" : t === "perf" ? "Performance" : "History"}
                                    </button>
                                ))}
                            </div>

                            {/* Tab Content */}
                            <div style={s.content}>
                                {tab === "docs" && (
                                    <EndpointViewer
                                        path={selected.path}
                                        method={selected.method}
                                        operation={selected.operation}
                                    />
                                )}
                                {tab === "tryit" && (
                                    <TryIt
                                        path={selected.path}
                                        method={selected.method}
                                        operation={selected.operation}
                                        baseUrl={effectiveBaseUrl}
                                        onResponse={handleResponse}
                                    />
                                )}
                                {tab === "perf" && watchfn && (
                                    <div style={{ padding: "20px" }}>
                                        {(() => {
                                            const raw = metrics[`${selected.method.toUpperCase()} ${selected.path}`];
                                            if (!raw) return <div style={s.empty}>No performance data available yet.</div>;
                                            return (
                                                <PerformanceOverlay
                                                    metrics={{
                                                        endpoint: selected.path,
                                                        method: selected.method,
                                                        p50Ms: raw.latency.p50,
                                                        p95Ms: raw.latency.p95,
                                                        p99Ms: raw.latency.p99,
                                                        errorRatePct: raw.errors.rate * 100,
                                                        requestsPerMinute: raw.throughput.rpm,
                                                        lastUpdated: raw.lastUpdated
                                                    }}
                                                />
                                            );
                                        })()}
                                    </div>
                                )}
                                {tab === "history" && showHistory && (
                                    <RequestHistory
                                        entries={history}
                                        onClear={() => setHistory([])}
                                    />
                                )}
                            </div>
                        </>
                    ) : (
                        <div style={s.empty}>
                            <div style={{ fontSize: "32px" }}>⚡</div>
                            <div>Select an endpoint from the sidebar</div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
