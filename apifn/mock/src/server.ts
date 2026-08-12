/**
 * Mock server implementation.
 *
 * Implements MOCK-001 (all paths served), MOCK-006 (delay), MOCK-007 (CORS).
 * Uses Node's built-in `http` module — no external HTTP framework required.
 */

import http from "node:http";
import { URL } from "node:url";
import type { OpenAPIDocument, MockServerOptions, OperationObject } from "@apifn/core";
import type { ResponseMode } from "./response-generator.js";
import { generateResponse } from "./response-generator.js";
import { validateRequestBody, validateParameters } from "./request-validator.js";

// ─── Internal types ───────────────────────────────────────────────────────────

interface RouteHandler {
    method: string;
    pattern: RegExp;
    paramNames: string[];
    operation: OperationObject;
}

export interface MockServer {
    /** Start the server on the configured port */
    start(): Promise<void>;
    /** Stop the server */
    stop(): Promise<void>;
    /** The underlying http.Server */
    server: http.Server;
    /** The port actually bound to */
    port: number;
}

const DEFAULT_MAX_REQUEST_BODY_BYTES = 10 * 1024 * 1024;

// ─── Path pattern conversion ──────────────────────────────────────────────────

/**
 * Convert OpenAPI path `/users/{id}` to a regex and extract param names.
 */
function compilePath(apiPath: string): { pattern: RegExp; paramNames: string[] } {
    const paramNames: string[] = [];
    let regex = "";
    let cursor = 0;

    while (cursor < apiPath.length) {
        const start = apiPath.indexOf("{", cursor);
        if (start === -1) {
            regex += escapeRegExp(apiPath.slice(cursor));
            break;
        }

        const end = apiPath.indexOf("}", start + 1);
        if (end === -1) {
            regex += escapeRegExp(apiPath.slice(cursor));
            break;
        }

        regex += escapeRegExp(apiPath.slice(cursor, start));
        paramNames.push(apiPath.slice(start + 1, end));
        regex += "([^/]+)";
        cursor = end + 1;
    }

    return { pattern: new RegExp(`^${regex}$`), paramNames };
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── CORS headers ─────────────────────────────────────────────────────────────

function applyCors(
    res: http.ServerResponse,
    cors: MockServerOptions["cors"]
): void {
    if (!cors) return;

    const origins = cors === true ? "*"
        : typeof cors === "object" && cors.origin
            ? Array.isArray(cors.origin) ? cors.origin.join(", ") : String(cors.origin)
            : "*";

    res.setHeader("Access-Control-Allow-Origin", origins);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key");
    if (cors !== true && typeof cors === "object" && cors.credentials) {
        res.setHeader("Access-Control-Allow-Credentials", "true");
    }
}

// ─── Request body reader ──────────────────────────────────────────────────────

function readBody(req: http.IncomingMessage, maxBytes = DEFAULT_MAX_REQUEST_BODY_BYTES): Promise<unknown> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        let size = 0;
        let rejected = false;
        req.on("data", (chunk: Buffer) => {
            if (rejected) return;
            size += chunk.byteLength;
            if (size > maxBytes) {
                rejected = true;
                reject(new Error(`Request body exceeds ${maxBytes} bytes`));
                return;
            }
            chunks.push(chunk);
        });
        req.on("end", () => {
            if (rejected) return;
            const raw = Buffer.concat(chunks).toString("utf8");
            if (!raw) {
                resolve(undefined);
                return;
            }
            try {
                resolve(JSON.parse(raw));
            } catch {
                reject(new Error("Invalid JSON body"));
            }
        });
        req.on("error", reject);
    });
}

// ─── JSON response helper ─────────────────────────────────────────────────────

function sendJson(
    res: http.ServerResponse,
    statusCode: number,
    body: unknown
): void {
    const payload = body !== null && body !== undefined
        ? JSON.stringify(body)
        : "";
    res.setHeader("Content-Type", "application/json");
    res.writeHead(statusCode);
    res.end(payload);
}

// ─── createMockServer ─────────────────────────────────────────────────────────

const HTTP_METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"] as const;

/**
 * Create a mock server from an OpenAPI spec.
 *
 * @returns MockServer with start() and stop() lifecycle methods.
 */
export function createMockServer(options: MockServerOptions): MockServer {
    const spec = options.spec as OpenAPIDocument;
    const port = options.port ?? 4010;
    const mode: ResponseMode = options.responseMode ?? "schema";
    const validateReqs = options.validateRequests ?? false;
    const delay = options.delay ?? 0;
    const cors = options.cors;
    const maxRequestBodyBytes = options.maxRequestBodyBytes ?? DEFAULT_MAX_REQUEST_BODY_BYTES;

    // Build route table
    const routes: RouteHandler[] = [];

    for (const [apiPath, pathItem] of Object.entries(spec.paths ?? {})) {
        if (!pathItem) continue;
        const { pattern, paramNames } = compilePath(apiPath);

        for (const method of HTTP_METHODS) {
            const op = pathItem[method] as OperationObject | undefined;
            if (op) {
                routes.push({ method, pattern, paramNames, operation: op });
            }
        }
    }

    // Node HTTP server
    const server = http.createServer(async (req, res) => {
        const rawMethod = (req.method ?? "GET").toLowerCase();

        // Parse URL
        const urlObj = new URL(req.url ?? "/", "http://localhost");
        const pathname = urlObj.pathname;
        const queryParams: Record<string, string> = {};
        for (const [k, v] of urlObj.searchParams.entries()) {
            queryParams[k] = v;
        }

        // Apply CORS
        applyCors(res, cors);

        // Handle CORS preflight
        if (rawMethod === "options") {
            res.writeHead(204);
            res.end();
            return;
        }

        // Find matching route
        const match = routes.find((r) => {
            return r.method === rawMethod && r.pattern.test(pathname);
        });

        if (!match) {
            sendJson(res, 404, { error: "Not Found", path: pathname });
            return;
        }

        // Extract path params
        const pathParamValues = pathname.match(match.pattern) ?? [];
        const pathParams: Record<string, string> = {};
        match.paramNames.forEach((name, i) => {
            pathParams[name] = pathParamValues[i + 1] ?? "";
        });

        // Optional delay (MOCK-006)
        if (delay > 0) {
            await new Promise<void>((resolve) => setTimeout(resolve, delay));
        }

        // Optional request validation (MOCK-005)
        if (validateReqs) {
            const paramValidation = validateParameters(queryParams, pathParams, match.operation);
            if (!paramValidation.valid) {
                sendJson(res, 400, { error: "Validation Error", errors: paramValidation.errors });
                return;
            }

            // Read body for validation
            if (rawMethod === "post" || rawMethod === "put" || rawMethod === "patch") {
                let body: unknown;
                try {
                    body = await readBody(req, maxRequestBodyBytes);
                } catch (error) {
                    sendJson(res, 400, { error: error instanceof Error ? error.message : "Invalid JSON body" });
                    return;
                }
                const bodyValidation = validateRequestBody(body, match.operation);
                if (!bodyValidation.valid) {
                    sendJson(res, 400, { error: "Validation Error", errors: bodyValidation.errors });
                    return;
                }
            }
        }

        // Generate response
        const { statusCode, body } = generateResponse(match.operation, mode);
        sendJson(res, statusCode, body);
    });

    let boundPort = port;

    return {
        server,
        get port() {
            return boundPort;
        },
        start() {
            return new Promise((resolve, reject) => {
                server.listen(port, () => {
                    const addr = server.address();
                    if (addr && typeof addr === "object") {
                        boundPort = addr.port;
                    }
                    resolve();
                });
                server.once("error", reject);
            });
        },
        stop() {
            return new Promise((resolve, reject) => {
                server.close((err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        },
    };
}
