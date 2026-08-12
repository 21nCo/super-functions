/**
 * EndpointViewer — displays full documentation for a single API endpoint (UI-R-002).
 * Method badge, path, summary, parameters table, request body, and response schemas.
 */

import React, { useState } from "react";
import type { OperationObject, SchemaObject } from "./types.js";
import { SchemaViewer } from "./SchemaViewer.js";
import { METHOD_COLORS } from "./styles/tokens.js";

export interface EndpointViewerProps {
    path: string;
    method: string;
    operation: OperationObject;
}

const s = {
    container: {
        padding: "24px",
        color: "var(--apifn-text)",
        fontFamily: "var(--apifn-font-sans)",
    } as React.CSSProperties,
    header: {
        display: "flex",
        alignItems: "center",
        gap: "12px",
        marginBottom: "20px",
        flexWrap: "wrap" as const,
    } as React.CSSProperties,
    methodBadge: (method: string): React.CSSProperties => {
        const colors = METHOD_COLORS[method.toLowerCase()] ?? { bg: "#2d3748", text: "#9ca3af" };
        return {
            padding: "4px 12px",
            borderRadius: "4px",
            background: colors.bg,
            color: colors.text,
            fontWeight: 700,
            fontSize: "13px",
            fontFamily: "var(--apifn-font-mono)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
        };
    },
    path: {
        fontFamily: "var(--apifn-font-mono)",
        fontSize: "18px",
        fontWeight: 600,
        color: "var(--apifn-text)",
    } as React.CSSProperties,
    summary: {
        fontSize: "15px",
        color: "var(--apifn-text-muted)",
        marginBottom: "8px",
    } as React.CSSProperties,
    description: {
        fontSize: "14px",
        color: "var(--apifn-text-muted)",
        lineHeight: 1.6,
        marginBottom: "24px",
    } as React.CSSProperties,
    section: {
        marginBottom: "24px",
    } as React.CSSProperties,
    sectionTitle: {
        fontSize: "13px",
        fontWeight: 700,
        textTransform: "uppercase" as const,
        letterSpacing: "0.08em",
        color: "var(--apifn-text-muted)",
        marginBottom: "12px",
        borderBottom: "1px solid var(--apifn-border)",
        paddingBottom: "6px",
    } as React.CSSProperties,
    table: {
        width: "100%",
        borderCollapse: "collapse" as const,
        fontSize: "13px",
    } as React.CSSProperties,
    th: {
        textAlign: "left" as const,
        padding: "6px 8px",
        color: "var(--apifn-text-muted)",
        fontWeight: 600,
        fontSize: "12px",
        borderBottom: "1px solid var(--apifn-border)",
    } as React.CSSProperties,
    td: {
        padding: "8px 8px",
        borderBottom: "1px solid var(--apifn-border)",
        verticalAlign: "top" as const,
    } as React.CSSProperties,
    paramName: {
        fontFamily: "var(--apifn-font-mono)",
        color: "var(--apifn-accent-text)",
    } as React.CSSProperties,
    badge: (color: string): React.CSSProperties => ({
        fontSize: "11px",
        padding: "1px 6px",
        borderRadius: "3px",
        background: `${color}22`,
        color,
        border: `1px solid ${color}44`,
    }),
    responseTab: (active: boolean): React.CSSProperties => ({
        padding: "6px 14px",
        borderRadius: "4px 4px 0 0",
        border: "1px solid var(--apifn-border)",
        borderBottom: active ? "1px solid var(--apifn-bg-surface)" : "none",
        background: active ? "var(--apifn-bg-surface)" : "transparent",
        color: active ? "var(--apifn-text)" : "var(--apifn-text-muted)",
        cursor: "pointer",
        fontSize: "13px",
        fontFamily: "var(--apifn-font-mono)",
        marginBottom: "-1px",
    }),
    schemaBox: {
        background: "var(--apifn-bg-surface)",
        border: "1px solid var(--apifn-border)",
        borderRadius: "var(--apifn-radius)",
        padding: "16px",
    } as React.CSSProperties,
};

function statusColor(code: string): string {
    const n = parseInt(code, 10);
    if (n >= 500) return "var(--apifn-red)";
    if (n >= 400) return "var(--apifn-orange, #fdba74)";
    if (n >= 300) return "var(--apifn-yellow)";
    if (n >= 200) return "var(--apifn-green)";
    return "var(--apifn-text-muted)";
}

export function EndpointViewer({ path, method, operation }: EndpointViewerProps): React.ReactElement {
    const responses = operation.responses ?? {};
    const responseCodes = Object.keys(responses);
    const [activeCode, setActiveCode] = useState<string>(responseCodes[0] ?? "200");

    const params = (operation.parameters ?? []) as Array<{
        name: string;
        in: string;
        required?: boolean;
        description?: string;
        schema?: SchemaObject;
        example?: unknown;
    }>;

    const reqBody = operation.requestBody as {
        required?: boolean;
        description?: string;
        content?: Record<string, { schema?: SchemaObject }>;
    } | undefined;

    const reqBodySchema = reqBody?.content?.["application/json"]?.schema;

    const activeResponse = responses[activeCode] as {
        description?: string;
        content?: Record<string, { schema?: SchemaObject }>;
    } | undefined;
    const responseSchema = activeResponse?.content?.["application/json"]?.schema;

    return (
        <div style={s.container}>
            {/* Header */}
            <div style={s.header}>
                <span style={s.methodBadge(method)}>{method}</span>
                <span style={s.path}>{path}</span>
                {operation.deprecated && (
                    <span style={s.badge("var(--apifn-yellow)")}>deprecated</span>
                )}
            </div>

            {operation.summary && <div style={s.summary}>{operation.summary as string}</div>}
            {operation.description && (
                <div style={s.description}>{operation.description as string}</div>
            )}

            {/* Parameters */}
            {params.length > 0 && (
                <div style={s.section}>
                    <div style={s.sectionTitle}>Parameters</div>
                    <table style={s.table}>
                        <thead>
                            <tr>
                                <th style={s.th}>Name</th>
                                <th style={s.th}>In</th>
                                <th style={s.th}>Type</th>
                                <th style={s.th}>Required</th>
                                <th style={s.th}>Description</th>
                            </tr>
                        </thead>
                        <tbody>
                            {params.map((p) => (
                                <tr key={`${p.in}-${p.name}`}>
                                    <td style={{ ...s.td, ...s.paramName }}>{p.name}</td>
                                    <td style={s.td}>
                                        <span style={s.badge("var(--apifn-text-muted)")}>{p.in}</span>
                                    </td>
                                    <td style={s.td}>
                                        <span style={{ fontFamily: "var(--apifn-font-mono)", fontSize: "12px" }}>
                                            {(p.schema?.type as string) ?? "string"}
                                        </span>
                                    </td>
                                    <td style={s.td}>
                                        {p.required && <span style={s.badge("var(--apifn-red)")}>✓</span>}
                                    </td>
                                    <td style={{ ...s.td, color: "var(--apifn-text-muted)", fontSize: "12px" }}>
                                        {p.description}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Request Body */}
            {reqBodySchema && (
                <div style={s.section}>
                    <div style={s.sectionTitle}>
                        Request Body {reqBody?.required && <span style={{ color: "var(--apifn-red)" }}>*</span>}
                    </div>
                    <div style={s.schemaBox}>
                        <SchemaViewer schema={reqBodySchema} />
                    </div>
                </div>
            )}

            {/* Responses */}
            {responseCodes.length > 0 && (
                <div style={s.section}>
                    <div style={s.sectionTitle}>Responses</div>
                    <div style={{ display: "flex", gap: "2px", flexWrap: "wrap", marginBottom: "0" }}>
                        {responseCodes.map((code) => (
                            <button
                                key={code}
                                style={s.responseTab(code === activeCode)}
                                onClick={() => setActiveCode(code)}
                            >
                                <span style={{ color: statusColor(code) }}>{code}</span>
                            </button>
                        ))}
                    </div>
                    <div style={s.schemaBox}>
                        <div style={{ marginBottom: "8px", color: "var(--apifn-text-muted)", fontSize: "13px" }}>
                            {activeResponse?.description}
                        </div>
                        {responseSchema && <SchemaViewer schema={responseSchema} />}
                        {!responseSchema && (
                            <span style={{ color: "var(--apifn-text-muted)", fontSize: "13px" }}>
                                No response body schema defined.
                            </span>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
