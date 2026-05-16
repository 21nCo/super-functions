/**
 * SchemaViewer — renders a JSON Schema as a collapsible tree (UI-R-003).
 */

import React, { useState } from "react";
import type { SchemaObject } from "./types.js";

export interface SchemaViewerProps {
    schema: SchemaObject;
    name?: string;
    required?: boolean;
    expandDepth?: number;
    /** Current depth (internal) */
    depth?: number;
}

const s = {
    node: {
        fontFamily: "var(--apifn-font-mono, monospace)",
        fontSize: "13px",
        lineHeight: "1.6",
    } as React.CSSProperties,
    row: {
        display: "flex",
        alignItems: "baseline",
        gap: "6px",
        cursor: "pointer",
        padding: "2px 0",
    } as React.CSSProperties,
    toggle: {
        color: "var(--apifn-text-muted)",
        userSelect: "none" as const,
        width: "14px",
        flexShrink: 0,
    },
    name: {
        color: "var(--apifn-accent)",
        fontWeight: 600,
    } as React.CSSProperties,
    required: {
        color: "var(--apifn-red)",
        fontSize: "11px",
        fontWeight: 700,
    } as React.CSSProperties,
    typeBadge: (type: string): React.CSSProperties => ({
        fontSize: "11px",
        padding: "1px 6px",
        borderRadius: "4px",
        background:
            type === "string" ? "#065f4622" :
                type === "integer" || type === "number" ? "#1e3a5f22" :
                    type === "boolean" ? "#78350f22" :
                        type === "array" ? "#5b21b622" :
                            "#2d3748",
        color:
            type === "string" ? "var(--apifn-green)" :
                type === "integer" || type === "number" ? "var(--apifn-blue)" :
                    type === "boolean" ? "var(--apifn-yellow)" :
                        type === "array" ? "var(--apifn-purple)" :
                            "var(--apifn-text-muted)",
        border: "1px solid currentColor",
        opacity: 0.9,
    }),
    description: {
        color: "var(--apifn-text-muted)",
        fontSize: "12px",
    } as React.CSSProperties,
    children: {
        borderLeft: "1px solid var(--apifn-border)",
        marginLeft: "8px",
        paddingLeft: "12px",
    } as React.CSSProperties,
};

export function SchemaViewer({
    schema,
    name,
    required = false,
    expandDepth = 2,
    depth = 0,
}: SchemaViewerProps): React.ReactElement {
    const schemaType = schema.type as string | string[] | undefined;
    const primaryType = Array.isArray(schemaType) ? schemaType[0] : schemaType ?? "object";
    const hasChildren = primaryType === "object" && schema.properties;
    const isArray = primaryType === "array";
    const itemSchema = schema.items as SchemaObject | undefined;

    const [expanded, setExpanded] = useState(depth < expandDepth);

    return (
        <div style={s.node}>
            <div style={s.row} onClick={() => hasChildren && setExpanded((e) => !e)}>
                <span style={s.toggle}>
                    {hasChildren ? (expanded ? "▾" : "▸") : " "}
                </span>
                {name && <span style={s.name}>{name}</span>}
                {required && <span style={s.required}>required</span>}
                <span style={s.typeBadge(primaryType)}>{primaryType}</span>
                {isArray && itemSchema && (
                    <span style={{ ...s.typeBadge("array"), opacity: 0.6 }}>
                        {"of "}
                        {(itemSchema.type as string) ?? "object"}
                    </span>
                )}
                {typeof schema.description === "string" && (
                    <span style={s.description}>{schema.description}</span>
                )}
                {Array.isArray(schema.enum) && (
                    <span style={s.description}>
                        enum: {(schema.enum as unknown[]).map(String).join(" | ")}
                    </span>
                )}
            </div>

            {/* Object properties */}
            {(hasChildren && expanded && typeof schema.properties === "object" && schema.properties !== null) ? (
                <div style={s.children}>
                    {Object.entries(schema.properties as Record<string, unknown>).map(([propName, propSchema]) => {
                        const requiredFields = (schema.required ?? []) as string[];
                        return (
                            <SchemaViewer
                                key={propName}
                                schema={propSchema as SchemaObject}
                                name={propName}
                                required={requiredFields.includes(propName)}
                                expandDepth={expandDepth}
                                depth={depth + 1}
                            />
                        );
                    })}
                </div>
            ) : null}

            {/* Array items */}
            {(isArray && itemSchema && expanded && typeof itemSchema.properties === "object" && itemSchema.properties !== null) ? (
                <div style={s.children}>
                    <SchemaViewer
                        schema={itemSchema}
                        name="items"
                        expandDepth={expandDepth}
                        depth={depth + 1}
                    />
                </div>
            ) : null}
        </div>
    );
}
