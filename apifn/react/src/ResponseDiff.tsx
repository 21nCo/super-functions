/**
 * ResponseDiff — side-by-side comparison of two API responses (UI-R-006).
 */

import React, { useMemo } from "react";
import type { TryItResponse } from "./types.js";

export interface ResponseDiffProps {
    left: TryItResponse;
    right: TryItResponse;
    leftLabel?: string;
    rightLabel?: string;
}

const s = {
    container: {
        fontFamily: "var(--apifn-font-sans)",
        color: "var(--apifn-text)",
    } as React.CSSProperties,
    header: {
        display: "flex",
        borderBottom: "1px solid var(--apifn-border)",
    } as React.CSSProperties,
    colHeader: {
        flex: 1,
        padding: "10px 16px",
        fontWeight: 700,
        fontSize: "13px",
        color: "var(--apifn-text-muted)",
    } as React.CSSProperties,
    summary: {
        display: "flex",
        gap: "24px",
        padding: "12px 16px",
        background: "var(--apifn-bg-surface)",
        borderBottom: "1px solid var(--apifn-border)",
        fontSize: "13px",
    } as React.CSSProperties,
    cols: {
        display: "flex",
        gap: "1px",
        background: "var(--apifn-border)",
    } as React.CSSProperties,
    col: {
        flex: 1,
        background: "var(--apifn-bg)",
        padding: "16px",
        overflow: "auto",
        maxHeight: "400px",
    } as React.CSSProperties,
    status: (code: number): React.CSSProperties => ({
        fontWeight: 700,
        color: code >= 200 && code < 300 ? "var(--apifn-green)" : code >= 400 ? "var(--apifn-red)" : "var(--apifn-yellow)",
    }),
    pre: {
        fontFamily: "var(--apifn-font-mono)",
        fontSize: "12px",
        whiteSpace: "pre-wrap" as const,
        wordBreak: "break-all" as const,
        color: "var(--apifn-text)",
        margin: 0,
    } as React.CSSProperties,
    diffLine: (kind: "added" | "removed" | "same"): React.CSSProperties => ({
        display: "block",
        background: kind === "added" ? "#065f4615" : kind === "removed" ? "#7f1d1d15" : "transparent",
        color: kind === "added" ? "var(--apifn-green)" : kind === "removed" ? "var(--apifn-red)" : "inherit",
        padding: "0 2px",
    }),
};

function diffLines(a: string, b: string): { kind: "same" | "added" | "removed"; text: string }[][] {
    const aLines = a.split("\n");
    const bLines = b.split("\n");
    const leftDiff: { kind: "same" | "added" | "removed"; text: string }[] = [];
    const rightDiff: { kind: "same" | "added" | "removed"; text: string }[] = [];

    const maxLen = Math.max(aLines.length, bLines.length);
    for (let i = 0; i < maxLen; i++) {
        const al = aLines[i] ?? "";
        const bl = bLines[i] ?? "";
        if (al === bl) {
            leftDiff.push({ kind: "same", text: al });
            rightDiff.push({ kind: "same", text: bl });
        } else {
            leftDiff.push({ kind: "removed", text: al });
            rightDiff.push({ kind: "added", text: bl });
        }
    }

    return [leftDiff, rightDiff];
}

function bodyToString(body: unknown): string {
    if (typeof body === "string") return body;
    return JSON.stringify(body, null, 2);
}

export function ResponseDiff({ left, right, leftLabel = "Before", rightLabel = "After" }: ResponseDiffProps): React.ReactElement {
    const [leftLines, rightLines] = useMemo(
        () => diffLines(bodyToString(left.body), bodyToString(right.body)),
        [left.body, right.body]
    );

    return (
        <div style={s.container}>
            <div style={s.header}>
                <div style={s.colHeader}>{leftLabel}</div>
                <div style={{ width: "1px", background: "var(--apifn-border)" }} />
                <div style={s.colHeader}>{rightLabel}</div>
            </div>

            {/* Summary comparison */}
            <div style={s.summary}>
                <span>
                    Status:{" "}
                    <span style={s.status(left.statusCode)}>{left.statusCode}</span>{" "}
                    →{" "}
                    <span style={s.status(right.statusCode)}>{right.statusCode}</span>
                </span>
                <span>
                    Duration:{" "}
                    <span style={{ fontFamily: "var(--apifn-font-mono)" }}>{left.durationMs}ms</span>{" "}
                    →{" "}
                    <span style={{ fontFamily: "var(--apifn-font-mono)", color: right.durationMs > left.durationMs ? "var(--apifn-red)" : "var(--apifn-green)" }}>
                        {right.durationMs}ms
                    </span>
                </span>
            </div>

            {/* Side-by-side body diff */}
            <div style={s.cols}>
                <div style={s.col}>
                    <pre style={s.pre}>
                        {leftLines.map((line, i) => (
                            <span key={i} style={s.diffLine(line.kind)}>{line.text}{"\n"}</span>
                        ))}
                    </pre>
                </div>
                <div style={s.col}>
                    <pre style={s.pre}>
                        {rightLines.map((line, i) => (
                            <span key={i} style={s.diffLine(line.kind)}>{line.text}{"\n"}</span>
                        ))}
                    </pre>
                </div>
            </div>
        </div>
    );
}
