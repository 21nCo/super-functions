/**
 * ApifnApiReference (React) — renders a docsfn RawContentEntry as an API reference page (DOCS-002, DOCS-005).
 */

import React, { useState } from "react";
import { EndpointViewer, TryIt, PerformanceOverlay } from "@apifn/react";
import type { ApifnApiReferenceProps, PerformanceMetrics } from "../types.js";
import type { OperationObject } from "@apifn/core";

export type { ApifnApiReferenceProps };

// Inline method colors — avoids importing internal @apifn/react paths
const METHOD_COLORS: Record<string, { bg: string; text: string }> = {
    get: { bg: "#065f46", text: "#6ee7b7" },
    post: { bg: "#1e3a5f", text: "#93c5fd" },
    put: { bg: "#78350f", text: "#fcd34d" },
    patch: { bg: "#5b21b6", text: "#c4b5fd" },
    delete: { bg: "#7f1d1d", text: "#fca5a5" },
    head: { bg: "#1f2937", text: "#9ca3af" },
    options: { bg: "#1f2937", text: "#9ca3af" },
};

function getThemeStyle(theme: "light" | "dark" | "auto"): string {
    const dark = `
    --apifn-bg:#0f1117;--apifn-bg-surface:#1a1d2e;--apifn-bg-surface-hover:#252840;
    --apifn-border:#2d3748;--apifn-text:#e2e8f0;--apifn-text-muted:#64748b;
    --apifn-accent:#7c3aed;--apifn-accent-text:#c4b5fd;--apifn-green:#6ee7b7;
    --apifn-blue:#93c5fd;--apifn-yellow:#fcd34d;--apifn-red:#fca5a5;
    --apifn-radius:6px;--apifn-font-mono:'JetBrains Mono',monospace;--apifn-font-sans:-apple-system,sans-serif
  `;
    const light = `
    --apifn-bg:#ffffff;--apifn-bg-surface:#f8fafc;--apifn-bg-surface-hover:#f1f5f9;
    --apifn-border:#e2e8f0;--apifn-text:#0f172a;--apifn-text-muted:#64748b;
    --apifn-accent:#7c3aed;--apifn-accent-text:#6d28d9;--apifn-green:#059669;
    --apifn-blue:#2563eb;--apifn-yellow:#d97706;--apifn-red:#dc2626;
    --apifn-radius:6px;--apifn-font-mono:'JetBrains Mono',monospace;--apifn-font-sans:-apple-system,sans-serif
  `;
    if (theme === "dark") return `.apifn-root{${dark}}`;
    if (theme === "light") return `.apifn-root{${light}}`;
    return `.apifn-root{${light}}@media(prefers-color-scheme:dark){.apifn-root{${dark}}}`;
}

const s = {
    root: {
        fontFamily: "var(--apifn-font-sans)",
        color: "var(--apifn-text)",
        background: "var(--apifn-bg)",
        maxWidth: "960px",
        margin: "0 auto",
        padding: "0 24px 48px",
    } as React.CSSProperties,
    pageTitle: { fontSize: "28px", fontWeight: 800, marginBottom: "8px" } as React.CSSProperties,
    pageSubtitle: { fontSize: "14px", color: "var(--apifn-text-muted)", marginBottom: "40px" } as React.CSSProperties,
    card: {
        border: "1px solid var(--apifn-border)",
        borderRadius: "var(--apifn-radius)",
        marginBottom: "24px",
        overflow: "hidden",
        background: "var(--apifn-bg-surface)",
    } as React.CSSProperties,
    cardHeader: {
        display: "flex", alignItems: "center", gap: "12px",
        padding: "14px 20px", cursor: "pointer",
        borderBottom: "1px solid var(--apifn-border)",
    } as React.CSSProperties,
    badge: (method: string): React.CSSProperties => {
        const c = METHOD_COLORS[method.toLowerCase()] ?? { bg: "#2d3748", text: "#9ca3af" };
        return { padding: "3px 10px", borderRadius: "3px", background: c.bg, color: c.text, fontWeight: 700, fontSize: "12px", fontFamily: "var(--apifn-font-mono)", textTransform: "uppercase" };
    },
    cardPath: { fontFamily: "var(--apifn-font-mono)", fontSize: "14px", fontWeight: 600, flex: 1 } as React.CSSProperties,
    cardSummary: { fontSize: "13px", color: "var(--apifn-text-muted)" } as React.CSSProperties,
    tabs: {
        display: "flex", borderBottom: "1px solid var(--apifn-border)", padding: "0 20px",
    } as React.CSSProperties,
    tab: (active: boolean): React.CSSProperties => ({
        padding: "10px 14px", fontSize: "13px",
        fontWeight: active ? 600 : 400,
        color: active ? "var(--apifn-text)" : "var(--apifn-text-muted)",
        border: "none", borderBottomWidth: "2px", borderBottomStyle: "solid",
        borderBottomColor: active ? "var(--apifn-accent)" : "transparent",
        background: "none", cursor: "pointer",
    }),
};

function EndpointCard({
    path, method, operation, tryIt, baseUrl, performanceMetrics,
}: Readonly<{
    path: string;
    method: string;
    operation: OperationObject;
    tryIt: boolean;
    baseUrl: string;
    performanceMetrics?: ApifnApiReferenceProps["performanceMetrics"];
}>) {
    const [open, setOpen] = useState(false);
    const [tab, setTab] = useState<"docs" | "tryit" | "perf">("docs");

    const perfKey = `${method.toUpperCase()} ${path}`;
    const rawMetrics = performanceMetrics?.[perfKey];
    const anchorId = `${method.toLowerCase()}-${path.replace(/[^a-z0-9]/gi, "-")}`;

    const perfMetrics: PerformanceMetrics | undefined = rawMetrics
        ? { endpoint: path, method, lastUpdated: new Date().toISOString(), ...rawMetrics }
        : undefined;

    return (
        <div id={anchorId} style={s.card}>
            <div style={s.cardHeader} onClick={() => setOpen((o) => !o)}>
                <span style={s.badge(method)}>{method.toUpperCase()}</span>
                <span style={s.cardPath}>{path}</span>
                {operation.summary && <span style={s.cardSummary}>{operation.summary as string}</span>}
                <span style={{ color: "var(--apifn-text-muted)", fontSize: "12px", transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}>▼</span>
            </div>

            {open && (
                <>
                    <div style={s.tabs}>
                        <button style={s.tab(tab === "docs")} onClick={() => setTab("docs")}>Docs</button>
                        {tryIt && <button style={s.tab(tab === "tryit")} onClick={() => setTab("tryit")}>Try It</button>}
                        {perfMetrics && <button style={s.tab(tab === "perf")} onClick={() => setTab("perf")}>Performance</button>}
                    </div>
                    {tab === "docs" && <EndpointViewer path={path} method={method} operation={operation} />}
                    {tab === "tryit" && tryIt && <TryIt path={path} method={method} operation={operation} baseUrl={baseUrl} />}
                    {tab === "perf" && perfMetrics && (
                        <div style={{ padding: "20px" }}>
                            <PerformanceOverlay metrics={perfMetrics} />
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

export function ApifnApiReference({
    entry, tryIt = false, baseUrl, theme = "auto", performanceMetrics,
}: Readonly<ApifnApiReferenceProps>): React.ReactElement {
    const themeStyle = getThemeStyle(theme);
    const effectiveBaseUrl =
        baseUrl
        ?? entry.baseUrl
        ?? (entry.spec as { servers?: Array<{ url: string }> }).servers?.[0]?.url
        ?? "https://api.example.com";

    return (
        <div className="apifn-root">
            <style>{themeStyle}</style>
            <div style={s.root}>
                <h1 style={s.pageTitle}>{entry.title}</h1>
                {entry.tag && (
                    <div style={s.pageSubtitle}>
                        Tag: <code style={{ fontFamily: "var(--apifn-font-mono)" }}>{entry.tag}</code>
                        {" — "}
                        {entry.endpoints.length} endpoint{entry.endpoints.length !== 1 ? "s" : ""}
                    </div>
                )}
                {entry.endpoints.map((ep) => (
                    <EndpointCard
                        key={`${ep.method}-${ep.path}`}
                        path={ep.path}
                        method={ep.method}
                        operation={ep.operation}
                        tryIt={tryIt}
                        baseUrl={effectiveBaseUrl}
                        performanceMetrics={performanceMetrics}
                    />
                ))}
            </div>
        </div>
    );
}
