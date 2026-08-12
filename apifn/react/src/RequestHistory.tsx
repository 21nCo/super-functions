/**
 * RequestHistory — list of past requests (UI-R-005).
 * Chronological list, click to inspect, clear button, max 500 entries.
 */

import React, { useState } from "react";
import type { HistoryEntry } from "./types.js";
import { METHOD_COLORS } from "./styles/tokens.js";

export interface RequestHistoryProps {
    entries: HistoryEntry[];
    onClear?: () => void;
    onSelect?: (entry: HistoryEntry) => void;
    maxEntries?: number;
}

const s = {
    container: {
        fontFamily: "var(--apifn-font-sans)",
        color: "var(--apifn-text)",
        fontSize: "13px",
    } as React.CSSProperties,
    header: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 16px",
        borderBottom: "1px solid var(--apifn-border)",
    } as React.CSSProperties,
    title: {
        fontWeight: 700,
        fontSize: "13px",
        textTransform: "uppercase" as const,
        letterSpacing: "0.06em",
        color: "var(--apifn-text-muted)",
    } as React.CSSProperties,
    clearBtn: {
        background: "none",
        border: "1px solid var(--apifn-border)",
        borderRadius: "var(--apifn-radius)",
        padding: "3px 10px",
        color: "var(--apifn-text-muted)",
        fontSize: "12px",
        cursor: "pointer",
    } as React.CSSProperties,
    empty: {
        padding: "32px",
        textAlign: "center" as const,
        color: "var(--apifn-text-muted)",
    } as React.CSSProperties,
    entry: (selected: boolean): React.CSSProperties => ({
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "10px 16px",
        borderBottom: "1px solid var(--apifn-border)",
        cursor: "pointer",
        background: selected ? "var(--apifn-bg-surface-hover)" : "transparent",
    }),
    method: (m: string): React.CSSProperties => {
        const c = METHOD_COLORS[m.toLowerCase()] ?? { bg: "#2d3748", text: "#9ca3af" };
        return { fontSize: "11px", fontWeight: 700, padding: "1px 6px", borderRadius: "3px", background: c.bg, color: c.text, fontFamily: "var(--apifn-font-mono)", minWidth: "46px", textAlign: "center" };
    },
    url: {
        flex: 1,
        fontFamily: "var(--apifn-font-mono)",
        fontSize: "12px",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap" as const,
    } as React.CSSProperties,
    status: (code?: number): React.CSSProperties => ({
        fontSize: "12px",
        fontWeight: 700,
        color: !code ? "var(--apifn-text-muted)" : code >= 200 && code < 300 ? "var(--apifn-green)" : code >= 400 ? "var(--apifn-red)" : "var(--apifn-yellow)",
    }),
    duration: {
        fontSize: "11px",
        color: "var(--apifn-text-muted)",
        minWidth: "50px",
        textAlign: "right" as const,
    } as React.CSSProperties,
    detail: {
        padding: "16px",
        background: "var(--apifn-bg-surface)",
        borderBottom: "1px solid var(--apifn-border)",
    } as React.CSSProperties,
    pre: {
        fontFamily: "var(--apifn-font-mono)",
        fontSize: "12px",
        whiteSpace: "pre-wrap" as const,
        wordBreak: "break-all" as const,
        color: "var(--apifn-text)",
        margin: 0,
    } as React.CSSProperties,
};

export function RequestHistory({ entries, onClear, onSelect, maxEntries = 500 }: RequestHistoryProps): React.ReactElement {
    const [selected, setSelected] = useState<string | null>(null);

    const visible = entries.slice(0, maxEntries).sort((a, b) => b.timestamp - a.timestamp);
    const selectedEntry = visible.find((e) => e.id === selected);

    function handleSelect(entry: HistoryEntry) {
        setSelected((s) => s === entry.id ? null : entry.id);
        onSelect?.(entry);
    }

    return (
        <div style={s.container}>
            <div style={s.header}>
                <span style={s.title}>Request History ({visible.length})</span>
                {onClear && (
                    <button style={s.clearBtn} onClick={onClear}>Clear</button>
                )}
            </div>

            {visible.length === 0 && <div style={s.empty}>No requests yet</div>}

            {visible.map((entry) => (
                <React.Fragment key={entry.id}>
                    <div style={s.entry(entry.id === selected)} onClick={() => handleSelect(entry)}>
                        <span style={s.method(entry.method)}>{entry.method.toUpperCase()}</span>
                        <span style={s.url}>{entry.url}</span>
                        {entry.statusCode && <span style={s.status(entry.statusCode)}>{entry.statusCode}</span>}
                        {entry.duration !== undefined && (
                            <span style={s.duration}>{entry.duration}ms</span>
                        )}
                        {entry.error && <span style={{ color: "var(--apifn-red)", fontSize: "12px" }}>✖</span>}
                    </div>

                    {entry.id === selected && selectedEntry && (
                        <div style={s.detail}>
                            <div style={{ marginBottom: "8px", fontSize: "12px", color: "var(--apifn-text-muted)" }}>
                                {new Date(selectedEntry.timestamp).toLocaleString()}
                            </div>
                            {selectedEntry.error && (
                                <div style={{ color: "var(--apifn-red)", marginBottom: "8px" }}>{selectedEntry.error}</div>
                            )}
                            {selectedEntry.requestBody !== undefined && (
                                <div style={{ marginBottom: "8px" }}>
                                    <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--apifn-text-muted)", marginBottom: "4px" }}>REQUEST BODY</div>
                                    <pre style={s.pre}>{JSON.stringify(selectedEntry.requestBody, null, 2)}</pre>
                                </div>
                            )}
                            {selectedEntry.responseBody !== undefined && (
                                <div>
                                    <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--apifn-text-muted)", marginBottom: "4px" }}>RESPONSE BODY</div>
                                    <pre style={s.pre}>{typeof selectedEntry.responseBody === "string" ? selectedEntry.responseBody : JSON.stringify(selectedEntry.responseBody, null, 2)}</pre>
                                </div>
                            )}
                        </div>
                    )}
                </React.Fragment>
            ))}
        </div>
    );
}
