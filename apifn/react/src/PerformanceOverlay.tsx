/**
 * PerformanceOverlay — watchfn metrics display (UI-R-007).
 * Latency percentiles (p50/p95/p99), error rate, throughput, last updated.
 */

import React from "react";
import type { PerformanceMetrics } from "./types.js";

export interface PerformanceOverlayProps {
    metrics: PerformanceMetrics;
    compact?: boolean;
}

const s = {
    container: {
        background: "var(--apifn-bg-surface)",
        border: "1px solid var(--apifn-border)",
        borderRadius: "var(--apifn-radius)",
        padding: "16px",
        fontFamily: "var(--apifn-font-sans)",
        color: "var(--apifn-text)",
    } as React.CSSProperties,
    title: {
        fontSize: "12px",
        fontWeight: 700,
        textTransform: "uppercase" as const,
        letterSpacing: "0.06em",
        color: "var(--apifn-text-muted)",
        marginBottom: "12px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
    } as React.CSSProperties,
    grid: {
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: "12px",
        marginBottom: "12px",
    } as React.CSSProperties,
    metric: {
        background: "var(--apifn-bg)",
        border: "1px solid var(--apifn-border)",
        borderRadius: "var(--apifn-radius)",
        padding: "10px 12px",
    } as React.CSSProperties,
    metricLabel: {
        fontSize: "11px",
        color: "var(--apifn-text-muted)",
        marginBottom: "4px",
    } as React.CSSProperties,
    metricValue: (warn: boolean): React.CSSProperties => ({
        fontSize: "20px",
        fontWeight: 700,
        fontFamily: "var(--apifn-font-mono)",
        color: warn ? "var(--apifn-red)" : "var(--apifn-text)",
    }),
    metricUnit: {
        fontSize: "12px",
        color: "var(--apifn-text-muted)",
        marginLeft: "2px",
    } as React.CSSProperties,
    barRow: {
        marginBottom: "8px",
    } as React.CSSProperties,
    barLabel: {
        display: "flex",
        justifyContent: "space-between",
        fontSize: "12px",
        color: "var(--apifn-text-muted)",
        marginBottom: "3px",
    } as React.CSSProperties,
    barTrack: {
        height: "6px",
        background: "var(--apifn-border)",
        borderRadius: "3px",
        overflow: "hidden",
    } as React.CSSProperties,
    barFill: (pct: number, color: string): React.CSSProperties => ({
        height: "100%",
        width: `${Math.min(100, pct)}%`,
        background: color,
        borderRadius: "3px",
        transition: "width 0.4s ease",
    }),
    footer: {
        fontSize: "11px",
        color: "var(--apifn-text-muted)",
        borderTop: "1px solid var(--apifn-border)",
        paddingTop: "8px",
        marginTop: "8px",
    } as React.CSSProperties,
};

// Reference ceiling for bar charts
const P99_CEIL = 2000; // 2s
const RPM_CEIL = 1000;

export function PerformanceOverlay({ metrics, compact = false }: PerformanceOverlayProps): React.ReactElement {
    const errorHigh = metrics.errorRatePct > 5;

    if (compact) {
        return (
            <div style={{ display: "flex", gap: "12px", alignItems: "center", fontSize: "12px", fontFamily: "var(--apifn-font-mono)", color: "var(--apifn-text-muted)" }}>
                <span>p50 <strong style={{ color: "var(--apifn-text)" }}>{metrics.p50Ms}ms</strong></span>
                <span>p99 <strong style={{ color: "var(--apifn-text)" }}>{metrics.p99Ms}ms</strong></span>
                <span>err <strong style={{ color: errorHigh ? "var(--apifn-red)" : "var(--apifn-text)" }}>{metrics.errorRatePct.toFixed(1)}%</strong></span>
                <span>{metrics.requestsPerMinute} rpm</span>
            </div>
        );
    }

    return (
        <div style={s.container}>
            <div style={s.title}>
                <span>⚡ Performance</span>
                <span style={{ fontSize: "11px", fontWeight: 400 }}>
                    {metrics.method.toUpperCase()} {metrics.endpoint}
                </span>
            </div>

            {/* KPI grid */}
            <div style={s.grid}>
                <div style={s.metric}>
                    <div style={s.metricLabel}>p50 Latency</div>
                    <div>
                        <span style={s.metricValue(false)}>{metrics.p50Ms}</span>
                        <span style={s.metricUnit}>ms</span>
                    </div>
                </div>
                <div style={s.metric}>
                    <div style={s.metricLabel}>p99 Latency</div>
                    <div>
                        <span style={s.metricValue(metrics.p99Ms > 1000)}>{metrics.p99Ms}</span>
                        <span style={s.metricUnit}>ms</span>
                    </div>
                </div>
                <div style={s.metric}>
                    <div style={s.metricLabel}>Error Rate</div>
                    <div>
                        <span style={s.metricValue(errorHigh)}>{metrics.errorRatePct.toFixed(1)}</span>
                        <span style={s.metricUnit}>%</span>
                    </div>
                </div>
            </div>

            {/* Latency bar charts */}
            {[
                { label: `p50 — ${metrics.p50Ms}ms`, val: metrics.p50Ms, color: "var(--apifn-green)" },
                { label: `p95 — ${metrics.p95Ms}ms`, val: metrics.p95Ms, color: "var(--apifn-yellow)" },
                { label: `p99 — ${metrics.p99Ms}ms`, val: metrics.p99Ms, color: metrics.p99Ms > 1000 ? "var(--apifn-red)" : "var(--apifn-blue)" },
            ].map(({ label, val, color }) => (
                <div key={label} style={s.barRow}>
                    <div style={s.barLabel}><span>{label}</span></div>
                    <div style={s.barTrack}>
                        <div style={s.barFill((val / P99_CEIL) * 100, color)} />
                    </div>
                </div>
            ))}

            {/* Throughput */}
            <div style={{ ...s.barRow, marginTop: "8px" }}>
                <div style={s.barLabel}><span>Throughput</span><span>{metrics.requestsPerMinute} rpm</span></div>
                <div style={s.barTrack}>
                    <div style={s.barFill((metrics.requestsPerMinute / RPM_CEIL) * 100, "var(--apifn-accent)")} />
                </div>
            </div>

            <div style={s.footer}>
                Last updated: {new Date(metrics.lastUpdated).toLocaleTimeString()}
            </div>
        </div>
    );
}
