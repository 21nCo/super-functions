/**
 * Request validator for the mock server.
 *
 * Implements MOCK-005: validates incoming request bodies and parameters against
 * their operation schemas. Returns 400 with validation errors when invalid.
 */

import type { OperationObject, SchemaObject } from "@apifn/core";

export interface ValidationError {
    path: string;
    message: string;
}

export interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
}

// ---------------------------------------------------------------------------
// Simple JSON Schema validator (no external deps)
// Handles: type, required, properties, minimum/maximum,
//          minLength/maxLength, enum
// ---------------------------------------------------------------------------

function validateValue(
    value: unknown,
    schema: SchemaObject,
    path: string,
    errors: ValidationError[]
): void {
    const type = schema.type as string | string[] | undefined;
    const types = Array.isArray(type) ? type : type ? [type] : [];

    if (types.length > 0) {
        const actualType = value === null ? "null"
            : Array.isArray(value) ? "array"
                : typeof value;

        const matches = types.some((t) => {
            if (t === "integer") return typeof value === "number" && Number.isInteger(value);
            return actualType === t;
        });

        if (!matches) {
            errors.push({ path, message: `Expected type ${types.join("|")} but got ${actualType}` });
            return; // no further checks on wrong type
        }
    }

    if (schema.enum) {
        if (!(schema.enum as unknown[]).includes(value)) {
            errors.push({ path, message: `Value not in enum: ${JSON.stringify(schema.enum)}` });
        }
    }

    if (typeof value === "string") {
        const minLen = schema.minLength !== undefined && schema.minLength !== null ? Number(schema.minLength) : undefined;
        const maxLen = schema.maxLength !== undefined && schema.maxLength !== null ? Number(schema.maxLength) : undefined;
        if (minLen !== undefined && value.length < minLen) {
            errors.push({ path, message: `String too short (min ${minLen})` });
        }
        if (maxLen !== undefined && value.length > maxLen) {
            errors.push({ path, message: `String too long (max ${maxLen})` });
        }
    }

    if (typeof value === "number") {
        const schMin = schema.minimum !== undefined && schema.minimum !== null ? Number(schema.minimum) : undefined;
        const schMax = schema.maximum !== undefined && schema.maximum !== null ? Number(schema.maximum) : undefined;
        if (schMin !== undefined && value < schMin) {
            errors.push({ path, message: `Value ${value} below minimum ${schMin}` });
        }
        if (schMax !== undefined && value > schMax) {
            errors.push({ path, message: `Value ${value} above maximum ${schMax}` });
        }
    }

    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        const obj = value as Record<string, unknown>;

        // required fields
        if (schema.required) {
            for (const req of schema.required as string[]) {
                if (!(req in obj)) {
                    errors.push({ path: `${path}.${req}`, message: `Required field '${req}' is missing` });
                }
            }
        }

        // properties
        if (schema.properties) {
            for (const [key, propSchema] of Object.entries(schema.properties)) {
                if (key in obj) {
                    validateValue(obj[key], propSchema as SchemaObject, `${path}.${key}`, errors);
                }
            }
        }
    }

    if (Array.isArray(value) && schema.items) {
        for (let i = 0; i < value.length; i++) {
            validateValue(value[i], schema.items as SchemaObject, `${path}[${i}]`, errors);
        }
    }
}

// ---------------------------------------------------------------------------
// Validate body against requestBody schema
// ---------------------------------------------------------------------------

export function validateRequestBody(
    body: unknown,
    operation: OperationObject
): ValidationResult {
    const errors: ValidationError[] = [];

    const reqBody = operation.requestBody;
    if (!reqBody || "$ref" in reqBody) {
        return { valid: true, errors: [] };
    }

    if (reqBody.required && (body === null || body === undefined)) {
        errors.push({ path: "body", message: "Request body is required" });
        return { valid: false, errors };
    }

    if (body === null || body === undefined) {
        return { valid: true, errors: [] };
    }

    const schema = reqBody.content?.["application/json"]?.schema as SchemaObject | undefined;
    if (schema) {
        validateValue(body, schema, "body", errors);
    }

    return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Validate query/path parameters
// ---------------------------------------------------------------------------

export function validateParameters(
    queryParams: Record<string, string | string[]>,
    pathParams: Record<string, string>,
    operation: OperationObject
): ValidationResult {
    const errors: ValidationError[] = [];

    const params = (operation.parameters ?? []) as Array<{
        name: string;
        in: string;
        required?: boolean;
        schema?: SchemaObject;
    }>;

    for (const param of params) {
        if ("$ref" in param) continue;

        let rawValue: string | string[] | undefined;
        if (param.in === "query") {
            rawValue = queryParams[param.name];
        } else if (param.in === "path") {
            rawValue = pathParams[param.name];
        }

        if (rawValue === undefined) {
            if (param.required) {
                errors.push({
                    path: `${param.in}.${param.name}`,
                    message: `Required parameter '${param.name}' is missing`,
                });
            }
            continue;
        }

        // Basic schema validation on the string value
        if (param.schema) {
            const schema = param.schema;
            const typeVal = schema.type as string | undefined;

            if (typeVal === "integer" || typeVal === "number") {
                const num = Number(rawValue);
                if (isNaN(num)) {
                    errors.push({ path: `${param.in}.${param.name}`, message: `Expected ${typeVal}` });
                }
            }
        }
    }

    return { valid: errors.length === 0, errors };
}
