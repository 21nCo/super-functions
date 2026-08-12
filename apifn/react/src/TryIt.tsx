/**
 * TryIt — interactive request builder and sender (UI-R-004).
 * URL bar, param inputs, body editor, auth config, send button, response display.
 */

import React, { useState, useCallback } from "react";
import type { OperationObject, AuthConfig, TryItResponse } from "./types.js";
import { METHOD_COLORS } from "./styles/tokens.js";

export interface TryItProps {
    path: string;
    method: string;
    operation: OperationObject;
    baseUrl?: string;
    defaultAuth?: AuthConfig;
    onResponse?: (response: TryItResponse) => void;
}

const s = {
    container: {
        padding: "20px",
        fontFamily: "var(--apifn-font-sans)",
        color: "var(--apifn-text)",
    } as React.CSSProperties,
    row: {
        display: "flex",
        gap: "8px",
        alignItems: "center",
        marginBottom: "16px",
    } as React.CSSProperties,
    methodBadge: (method: string): React.CSSProperties => {
        const c = METHOD_COLORS[method.toLowerCase()] ?? { bg: "#2d3748", text: "#9ca3af" };
        return { padding: "6px 12px", borderRadius: "4px", background: c.bg, color: c.text, fontWeight: 700, fontSize: "13px", fontFamily: "var(--apifn-font-mono)" };
    },
    input: {
        flex: 1,
        background: "var(--apifn-bg-surface)",
        border: "1px solid var(--apifn-border)",
        borderRadius: "var(--apifn-radius)",
        padding: "8px 12px",
        color: "var(--apifn-text)",
        fontFamily: "var(--apifn-font-mono)",
        fontSize: "13px",
        outline: "none",
    } as React.CSSProperties,
    sendBtn: {
        padding: "8px 20px",
        background: "var(--apifn-accent)",
        color: "#fff",
        border: "none",
        borderRadius: "var(--apifn-radius)",
        fontSize: "14px",
        fontWeight: 600,
        cursor: "pointer",
        flexShrink: 0,
    } as React.CSSProperties,
    label: {
        fontSize: "12px",
        fontWeight: 600,
        textTransform: "uppercase" as const,
        letterSpacing: "0.06em",
        color: "var(--apifn-text-muted)",
        marginBottom: "6px",
        display: "block",
    } as React.CSSProperties,
    section: { marginBottom: "16px" } as React.CSSProperties,
    textarea: {
        width: "100%",
        background: "var(--apifn-bg-surface)",
        border: "1px solid var(--apifn-border)",
        borderRadius: "var(--apifn-radius)",
        padding: "10px 12px",
        color: "var(--apifn-text)",
        fontFamily: "var(--apifn-font-mono)",
        fontSize: "13px",
        resize: "vertical" as const,
        outline: "none",
        minHeight: "100px",
    } as React.CSSProperties,
    select: {
        background: "var(--apifn-bg-surface)",
        border: "1px solid var(--apifn-border)",
        borderRadius: "var(--apifn-radius)",
        padding: "6px 10px",
        color: "var(--apifn-text)",
        fontSize: "13px",
        outline: "none",
        cursor: "pointer",
    } as React.CSSProperties,
    responseBox: {
        background: "var(--apifn-bg-surface)",
        border: "1px solid var(--apifn-border)",
        borderRadius: "var(--apifn-radius)",
        padding: "16px",
        marginTop: "16px",
    } as React.CSSProperties,
    statusLine: (status: number): React.CSSProperties => ({
        fontWeight: 700,
        fontSize: "16px",
        color: status >= 200 && status < 300 ? "var(--apifn-green)"
            : status >= 400 ? "var(--apifn-red)"
                : "var(--apifn-yellow)",
        marginBottom: "8px",
    }),
    pre: {
        fontFamily: "var(--apifn-font-mono)",
        fontSize: "12px",
        whiteSpace: "pre-wrap" as const,
        wordBreak: "break-all" as const,
        color: "var(--apifn-text)",
        margin: 0,
    } as React.CSSProperties,
};

function buildAuthHeaders(auth: AuthConfig): Record<string, string> {
    if (auth.type === "bearer" && auth.token) return { Authorization: `Bearer ${auth.token}` };
    if (auth.type === "apikey" && auth.key && auth.keyIn === "header") return { [auth.keyName ?? "X-API-Key"]: auth.key };
    if (auth.type === "basic" && auth.username) {
        const encoded = btoa(`${auth.username}:${auth.password ?? ""}`);
        return { Authorization: `Basic ${encoded}` };
    }
    return {};
}

export function TryIt({ path, method, operation, baseUrl = "https://api.example.com", defaultAuth, onResponse }: TryItProps): React.ReactElement {
    const params = (operation.parameters ?? []) as Array<{ name: string; in: string; required?: boolean; schema?: { type?: string } }>;
    const pathParams = params.filter((p) => p.in === "path");
    const queryParams = params.filter((p) => p.in === "query");

    const [pathValues, setPathValues] = useState<Record<string, string>>({});
    const [queryValues, setQueryValues] = useState<Record<string, string>>({});
    const [headerValues] = useState<Record<string, string>>({});
    const [body, setBody] = useState("");
    const [auth, setAuth] = useState<AuthConfig>(defaultAuth ?? { type: "none" });
    const [response, setResponse] = useState<TryItResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const resolvedPath = (() => {
        let result = "";
        let cursor = 0;
        while (cursor < path.length) {
            const start = path.indexOf("{", cursor);
            if (start === -1) {
                result += path.slice(cursor);
                break;
            }
            const end = path.indexOf("}", start + 1);
            if (end === -1) {
                result += path.slice(cursor);
                break;
            }
            const name = path.slice(start + 1, end);
            result += path.slice(cursor, start);
            result += pathValues[name] ?? `{${name}}`;
            cursor = end + 1;
        }
        return result;
    })();
    const queryString = Object.entries(queryValues)
        .filter(([, v]) => v)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&");
    const url = `${baseUrl.replace(/\/$/, "")}${resolvedPath}${queryString ? "?" + queryString : ""}`;

    const sendRequest = useCallback(async () => {
        setLoading(true);
        setError(null);
        const start = Date.now();
        try {
            const headers: Record<string, string> = { ...buildAuthHeaders(auth) };
            for (const [k, v] of Object.entries(headerValues)) {
                if (v) headers[k] = v;
            }
            let parsedBody: string | undefined;
            if (body.trim()) {
                headers["Content-Type"] = "application/json";
                parsedBody = body;
            }
            const res = await fetch(url, {
                method: method.toUpperCase(),
                headers,
                body: parsedBody,
            });
            const durationMs = Date.now() - start;
            const resHeaders: Record<string, string> = {};
            res.headers.forEach((v, k) => { resHeaders[k] = v; });
            let resBody: unknown;
            const ct = res.headers.get("content-type") ?? "";
            if (ct.includes("application/json")) {
                resBody = await res.json();
            } else {
                resBody = await res.text();
            }
            const result: TryItResponse = { statusCode: res.status, statusText: res.statusText, headers: resHeaders, body: resBody, durationMs };
            setResponse(result);
            onResponse?.(result);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }, [url, method, body, auth, headerValues, onResponse]);

    return (
        <div style={s.container}>
            {/* URL Bar */}
            <div style={s.row}>
                <span style={s.methodBadge(method)}>{method.toUpperCase()}</span>
                <input readOnly value={url} style={s.input} />
                <button style={s.sendBtn} onClick={sendRequest} disabled={loading}>
                    {loading ? "Sending…" : "Send"}
                </button>
            </div>

            {/* Path Params */}
            {pathParams.length > 0 && (
                <div style={s.section}>
                    <label style={s.label}>Path Parameters</label>
                    {pathParams.map((p) => (
                        <div key={p.name} style={{ ...s.row, marginBottom: "8px" }}>
                            <span style={{ width: "120px", fontFamily: "var(--apifn-font-mono)", fontSize: "13px", color: "var(--apifn-accent-text)" }}>{p.name}</span>
                            <input
                                style={s.input}
                                placeholder={`{${p.name}}`}
                                value={pathValues[p.name] ?? ""}
                                onChange={(e) => setPathValues((v) => ({ ...v, [p.name]: e.target.value }))}
                            />
                        </div>
                    ))}
                </div>
            )}

            {/* Query Params */}
            {queryParams.length > 0 && (
                <div style={s.section}>
                    <label style={s.label}>Query Parameters</label>
                    {queryParams.map((p) => (
                        <div key={p.name} style={{ ...s.row, marginBottom: "8px" }}>
                            <span style={{ width: "120px", fontFamily: "var(--apifn-font-mono)", fontSize: "13px", color: "var(--apifn-accent-text)" }}>{p.name}</span>
                            <input
                                style={s.input}
                                placeholder={p.name}
                                value={queryValues[p.name] ?? ""}
                                onChange={(e) => setQueryValues((v) => ({ ...v, [p.name]: e.target.value }))}
                            />
                        </div>
                    ))}
                </div>
            )}

            {/* Auth */}
            <div style={s.section}>
                <label style={s.label}>Auth</label>
                <div style={s.row}>
                    <select style={s.select} value={auth.type} onChange={(e) => setAuth({ type: e.target.value as AuthConfig["type"] })}>
                        <option value="none">None</option>
                        <option value="bearer">Bearer Token</option>
                        <option value="apikey">API Key</option>
                        <option value="basic">Basic Auth</option>
                    </select>
                    {auth.type === "bearer" && (
                        <input style={s.input} placeholder="Bearer token" value={auth.token ?? ""} onChange={(e) => setAuth((a) => ({ ...a, token: e.target.value }))} />
                    )}
                    {auth.type === "apikey" && (
                        <input style={s.input} placeholder="API key value" value={auth.key ?? ""} onChange={(e) => setAuth((a) => ({ ...a, key: e.target.value }))} />
                    )}
                    {auth.type === "basic" && (
                        <>
                            <input style={{ ...s.input, flex: "0 0 auto", width: "140px" }} placeholder="Username" value={auth.username ?? ""} onChange={(e) => setAuth((a) => ({ ...a, username: e.target.value }))} />
                            <input style={{ ...s.input, flex: "0 0 auto", width: "140px" }} type="password" placeholder="Password" value={auth.password ?? ""} onChange={(e) => setAuth((a) => ({ ...a, password: e.target.value }))} />
                        </>
                    )}
                </div>
            </div>

            {/* Body */}
            {["post", "put", "patch"].includes(method.toLowerCase()) && (
                <div style={s.section}>
                    <label style={s.label}>Request Body</label>
                    <textarea style={s.textarea} value={body} onChange={(e) => setBody(e.target.value)} placeholder="{}" spellCheck={false} />
                </div>
            )}

            {/* Error */}
            {error && (
                <div style={{ background: "#7f1d1d22", border: "1px solid #7f1d1d", borderRadius: "var(--apifn-radius)", padding: "10px 14px", color: "var(--apifn-red)", fontSize: "13px", marginBottom: "12px" }}>
                    {error}
                </div>
            )}

            {/* Response */}
            {response && (
                <div style={s.responseBox}>
                    <div style={s.statusLine(response.statusCode)}>
                        {response.statusCode} {response.statusText}
                        <span style={{ fontSize: "13px", fontWeight: 400, color: "var(--apifn-text-muted)", marginLeft: "12px" }}>
                            {response.durationMs}ms
                        </span>
                    </div>
                    <details style={{ marginBottom: "8px" }}>
                        <summary style={{ cursor: "pointer", color: "var(--apifn-text-muted)", fontSize: "12px" }}>
                            Response Headers ({Object.keys(response.headers).length})
                        </summary>
                        <pre style={s.pre}>{Object.entries(response.headers).map(([k, v]) => `${k}: ${v}`).join("\n")}</pre>
                    </details>
                    <pre style={s.pre}>
                        {typeof response.body === "string" ? response.body : JSON.stringify(response.body, null, 2)}
                    </pre>
                </div>
            )}
        </div>
    );
}
