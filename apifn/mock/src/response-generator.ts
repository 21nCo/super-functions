/**
 * Response generator for the mock server.
 *
 * Implements MOCK-002 (schema mode), MOCK-003 (examples mode), MOCK-004 (random mode).
 * Per SPEC Section 7.6.
 */

import type { OperationObject, SchemaObject, ResponseObject } from "@apifn/core";

export type ResponseMode = "schema" | "examples" | "random";

// ---------------------------------------------------------------------------
// Schema-based generation (MOCK-002)
// Deterministic: given same schema → same output
// ---------------------------------------------------------------------------

export function generateFromSchema(schema: SchemaObject | undefined): unknown {
    if (!schema) return null;

    const type = schema.type as string | string[] | undefined;
    const primaryType = Array.isArray(type) ? type[0] : type;

    switch (primaryType) {
        case "string": {
            if (schema.enum) return (schema.enum as unknown[])[0];
            if (schema.format === "date-time") return "2026-01-01T00:00:00Z";
            if (schema.format === "date") return "2026-01-01";
            if (schema.format === "email") return "user@example.com";
            if (schema.format === "uri" || schema.format === "url") return "https://example.com";
            if (schema.format === "uuid") return "00000000-0000-0000-0000-000000000000";
            return "string";
        }
        case "integer":
        case "number":
            return 0;
        case "boolean":
            return true;
        case "null":
            return null;
        case "array": {
            const itemSchema = schema.items as SchemaObject | undefined;
            return [generateFromSchema(itemSchema)];
        }
        case "object":
        default: {
            if (schema.properties) {
                const obj: Record<string, unknown> = {};
                for (const [key, propSchema] of Object.entries(schema.properties)) {
                    obj[key] = generateFromSchema(propSchema as SchemaObject);
                }
                return obj;
            }
            return {};
        }
    }
}

// ---------------------------------------------------------------------------
// Random mode (MOCK-004)
// Valid against schema but with randomized values
// ---------------------------------------------------------------------------

function randomString(length = 8): string {
    const chars = "abcdefghijklmnopqrstuvwxyz";
    let s = "";
    for (let i = 0; i < length; i++) {
        s += chars[Math.floor(Math.random() * chars.length)];
    }
    return s;
}

export function generateRandom(schema: SchemaObject | undefined): unknown {
    if (!schema) return null;

    const type = schema.type as string | string[] | undefined;
    const primaryType = Array.isArray(type) ? type[0] : type;

    switch (primaryType) {
        case "string": {
            if (schema.enum) {
                const enums = schema.enum as unknown[];
                return enums[Math.floor(Math.random() * enums.length)];
            }
            if (schema.format === "date-time") return new Date(Date.now() + Math.random() * 1e10).toISOString();
            if (schema.format === "email") return `${randomString(5)}@example.com`;
            return randomString();
        }
        case "integer":
            return Math.floor(Math.random() * 1000);
        case "number":
            return Math.random() * 1000;
        case "boolean":
            return Math.random() > 0.5;
        case "null":
            return null;
        case "array": {
            const itemSchema = schema.items as SchemaObject | undefined;
            return [generateRandom(itemSchema)];
        }
        case "object":
        default: {
            if (schema.properties) {
                const obj: Record<string, unknown> = {};
                for (const [key, propSchema] of Object.entries(schema.properties)) {
                    obj[key] = generateRandom(propSchema as SchemaObject);
                }
                return obj;
            }
            return {};
        }
    }
}

// ---------------------------------------------------------------------------
// Examples mode (MOCK-003)
// Falls back to schema generation if no examples found
// ---------------------------------------------------------------------------

function getResponseSchema(
    response: ResponseObject
): SchemaObject | undefined {
    return response.content?.["application/json"]?.schema as SchemaObject | undefined;
}

function getResponseExample(
    response: ResponseObject
): unknown {
    const json = response.content?.["application/json"];
    if (!json) return undefined;
    if (json.example !== undefined) return json.example;
    if (json.examples) {
        const first = Object.values(json.examples)[0];
        if (first && !("$ref" in first)) return (first as { value?: unknown }).value;
    }
    // schema-level example
    const schema = json.schema as (SchemaObject & { example?: unknown }) | undefined;
    if (schema?.example !== undefined) return schema.example;
    return undefined;
}

// ---------------------------------------------------------------------------
// Main: pick the right generation strategy
// ---------------------------------------------------------------------------

export function generateResponse(
    operation: OperationObject,
    mode: ResponseMode
): { statusCode: number; body: unknown } {
    const responses = operation.responses ?? {};
    const codes = Object.keys(responses).sort();

    // Pick first successful status code (2xx), fall back to first
    const successCode = codes.find((c) => c.startsWith("2")) ?? codes[0];
    const statusCode = successCode ? parseInt(successCode, 10) : 200;

    const responseObj = successCode ? responses[successCode] : undefined;

    // Handle $ref (skip, return null body)
    if (!responseObj || "$ref" in responseObj) {
        return { statusCode: statusCode || 200, body: null };
    }

    const response = responseObj as ResponseObject;

    if (mode === "examples") {
        const example = getResponseExample(response);
        if (example !== undefined) {
            return { statusCode, body: example };
        }
        // fallback to schema
    }

    if (mode === "random") {
        const schema = getResponseSchema(response);
        return { statusCode, body: schema ? generateRandom(schema) : null };
    }

    // schema mode (default + examples fallback)
    const schema = getResponseSchema(response);
    return { statusCode, body: schema ? generateFromSchema(schema) : null };
}
