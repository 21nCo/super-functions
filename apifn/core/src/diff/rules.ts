/**
 * Breaking/non-breaking change classification rules.
 *
 * Each rule function inspects specific aspects of two OpenAPI operations
 * and emits DiffEntry objects via the provided collector.
 */

import type { DiffEntry, OperationObject, ParameterObject } from "../types.js";

type Emit = (entry: DiffEntry) => void;

/** HTTP methods recognized as operation keys on a PathItem */
export const HTTP_METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isRef(obj: unknown): obj is { $ref: string } {
    return typeof obj === "object" && obj !== null && "$ref" in obj;
}

function emitUnresolvedRef(opPath: string, location: string, ref: string, emit: Emit): void {
    emit({
        type: "modified",
        breaking: true,
        path: `${opPath}.${location}`,
        description: `Parameter reference '${ref}' in ${opPath} could not be resolved; diff coverage is incomplete`,
    });
}

function resolveParam(p: unknown, opPath: string, location: string, emit: Emit): ParameterObject | null {
    if (isRef(p)) {
        emitUnresolvedRef(opPath, location, p.$ref, emit);
        return null;
    }
    if (typeof p === "object" && p !== null && "name" in p && "in" in p) {
        return p as ParameterObject;
    }
    return null;
}

/** Get the type or types from a JSON Schema object */
function schemaTypes(schema: Record<string, unknown> | null | undefined): string[] {
    if (!schema) return [];
    const t = schema.type;
    if (Array.isArray(t)) return t.map(String);
    if (typeof t === "string") return [t];
    return [];
}

/** Determine whether moving from beforeTypes to afterTypes is a narrowing */
function isTypeNarrowing(before: Record<string, unknown> | null, after: Record<string, unknown> | null): boolean {
    if (!before || !after) return false;
    const bt = schemaTypes(before);
    const at = schemaTypes(after);
    if (bt.length === 0 || at.length === 0) return false;
    // Narrowing: after has fewer types than before (subset)
    if (at.length < bt.length) {
        return at.every((t) => bt.includes(t));
    }
    return false;
}

// ---------------------------------------------------------------------------
// Parameter rules (DIFF-002, DIFF-003, DIFF-006)
// ---------------------------------------------------------------------------

export function diffParameters(
    opPath: string,
    before: OperationObject,
    after: OperationObject,
    emit: Emit
): void {
    const beforeParams = (before.parameters ?? [])
        .map((param, index) => resolveParam(param, opPath, `parameters[${index}]`, emit))
        .filter((p): p is ParameterObject => p !== null);
    const afterParams = (after.parameters ?? [])
        .map((param, index) => resolveParam(param, opPath, `parameters[${index}]`, emit))
        .filter((p): p is ParameterObject => p !== null);

    const beforeMap = new Map<string, ParameterObject>();
    for (const p of beforeParams) {
        beforeMap.set(`${p.in}:${p.name}`, p);
    }

    const afterMap = new Map<string, ParameterObject>();
    for (const p of afterParams) {
        afterMap.set(`${p.in}:${p.name}`, p);
    }

    // Added parameters
    for (const [key, afterParam] of afterMap) {
        if (!beforeMap.has(key)) {
            const required = afterParam.required === true;
            emit({
                type: "added",
                breaking: required,
                path: `${opPath}.parameters.${afterParam.name}`,
                description: required
                    ? `Required parameter '${afterParam.name}' (${afterParam.in}) added to ${opPath} — breaking`
                    : `Optional parameter '${afterParam.name}' (${afterParam.in}) added to ${opPath}`,
            });
        }
    }

    // Removed parameters
    for (const [key, beforeParam] of beforeMap) {
        if (!afterMap.has(key)) {
            emit({
                type: "removed",
                breaking: true,
                path: `${opPath}.parameters.${beforeParam.name}`,
                description: `Parameter '${beforeParam.name}' (${beforeParam.in}) removed from ${opPath}`,
            });
        }
    }

    // Modified parameters — type narrowing (DIFF-003)
    for (const [key, beforeParam] of beforeMap) {
        const afterParam = afterMap.get(key);
        if (!afterParam) continue;

        const bs = beforeParam.schema as Record<string, unknown> | null;
        const as = afterParam.schema as Record<string, unknown> | null;
        if (isTypeNarrowing(bs, as)) {
            emit({
                type: "modified",
                breaking: true,
                path: `${opPath}.parameters.${beforeParam.name}.schema.type`,
                description: `Parameter '${beforeParam.name}' type narrowed in ${opPath}`,
                before: bs?.type,
                after: as?.type,
            });
        }

        // required changed from non-required to required
        if (!beforeParam.required && afterParam.required) {
            emit({
                type: "modified",
                breaking: true,
                path: `${opPath}.parameters.${beforeParam.name}.required`,
                description: `Parameter '${beforeParam.name}' became required in ${opPath}`,
                before: false,
                after: true,
            });
        }
    }
}

// ---------------------------------------------------------------------------
// Request body rules (DIFF-003)
// ---------------------------------------------------------------------------

export function diffRequestBody(
    opPath: string,
    before: OperationObject,
    after: OperationObject,
    emit: Emit
): void {
    const beforeBody = isRef(before.requestBody) ? null : before.requestBody;
    const afterBody = isRef(after.requestBody) ? null : after.requestBody;

    if (beforeBody && !afterBody) {
        emit({
            type: "removed",
            breaking: true,
            path: `${opPath}.requestBody`,
            description: `Request body removed from ${opPath}`,
        });
        return;
    }

    if (!beforeBody && afterBody) {
        const required = afterBody.required === true;
        emit({
            type: "added",
            breaking: required,
            path: `${opPath}.requestBody`,
            description: required
                ? `Required request body added to ${opPath} — breaking`
                : `Optional request body added to ${opPath}`,
        });
        return;
    }

    if (!beforeBody || !afterBody) return;

    if (!beforeBody.required && afterBody.required) {
        emit({
            type: "modified",
            breaking: true,
            path: `${opPath}.requestBody.required`,
            description: `Request body became required in ${opPath}`,
            before: false,
            after: true,
        });
    }

    // Compare JSON schemas from application/json content
    const beforeSchema = (beforeBody.content?.["application/json"]?.schema ?? null) as Record<string, unknown> | null;
    const afterSchema = (afterBody.content?.["application/json"]?.schema ?? null) as Record<string, unknown> | null;

    if (!beforeSchema || !afterSchema) return;

    // Detect type narrowing at top level
    if (isTypeNarrowing(beforeSchema, afterSchema)) {
        emit({
            type: "modified",
            breaking: true,
            path: `${opPath}.requestBody.content.application/json.schema.type`,
            description: `Request body type narrowed in ${opPath}`,
            before: beforeSchema.type,
            after: afterSchema.type,
        });
    }

    // Detect new required fields in body schema (DIFF-002 for body)
    diffObjectSchemaRequiredFields(opPath, "requestBody.content.application/json.schema", beforeSchema, afterSchema, emit);
}

function diffObjectSchemaRequiredFields(
    opPath: string,
    schemaPath: string,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
    emit: Emit
): void {
    const beforeRequired = new Set<string>(Array.isArray(before.required) ? before.required : []);
    const afterRequired = new Set<string>(Array.isArray(after.required) ? after.required : []);

    const afterProps = (after.properties ?? {}) as Record<string, unknown>;
    const beforeProps = (before.properties ?? {}) as Record<string, unknown>;

    // Required fields newly introduced or existing optional fields made required.
    for (const field of afterRequired) {
        if (!beforeRequired.has(field)) {
            emit({
                type: "modified",
                breaking: true,
                path: `${opPath}.${schemaPath}.required`,
                description: beforeProps[field]
                    ? `Existing request body field '${field}' became required in ${opPath}`
                    : `New required field '${field}' added to request body in ${opPath}`,
            });
        }
    }

    // Removed properties from body
    for (const prop of Object.keys(beforeProps)) {
        if (!(prop in afterProps)) {
            // Removing a field from the response object is breaking per DIFF-004 semantics but
            // from a request body perspective it could be considered non-breaking. However, SPEC
            // Section 7.5 only lists "response field removed" as breaking; skip here.
        }
    }
}

// ---------------------------------------------------------------------------
// Response rules (DIFF-004, DIFF-006)
// ---------------------------------------------------------------------------

export function diffResponses(
    opPath: string,
    before: OperationObject,
    after: OperationObject,
    emit: Emit
): void {
    const beforeResponses = before.responses ?? {};
    const afterResponses = after.responses ?? {};

    // Removed response status codes
    for (const statusCode of Object.keys(beforeResponses).sort()) {
        if (!(statusCode in afterResponses)) {
            emit({
                type: "removed",
                breaking: true,
                path: `${opPath}.responses.${statusCode}`,
                description: `Response status ${statusCode} removed from ${opPath}`,
            });
        }
    }

    // Added response status codes (non-breaking)
    for (const statusCode of Object.keys(afterResponses).sort()) {
        if (!(statusCode in beforeResponses)) {
            emit({
                type: "added",
                breaking: false,
                path: `${opPath}.responses.${statusCode}`,
                description: `Response status ${statusCode} added to ${opPath}`,
            });
        }
    }

    // For existing status codes, diff the schema fields
    for (const statusCode of Object.keys(beforeResponses).sort()) {
        if (!(statusCode in afterResponses)) continue;
        const beforeResp = beforeResponses[statusCode];
        const afterResp = afterResponses[statusCode];
        if (isRef(beforeResp) || isRef(afterResp)) continue;

        const beforeSchema = (beforeResp?.content?.["application/json"]?.schema ?? null) as Record<string, unknown> | null;
        const afterSchema = (afterResp?.content?.["application/json"]?.schema ?? null) as Record<string, unknown> | null;

        if (!beforeSchema || !afterSchema) continue;

        const schemaBasePath = `${opPath}.responses.${statusCode}.content.application/json.schema`;

        // Check for removed properties (DIFF-004: response field removal is breaking)
        if (typeof beforeSchema.properties === "object" && typeof afterSchema.properties === "object") {
            const beforeProps = (beforeSchema.properties ?? {}) as Record<string, unknown>;
            const afterProps = (afterSchema.properties ?? {}) as Record<string, unknown>;

            for (const prop of Object.keys(beforeProps).sort()) {
                if (!(prop in afterProps)) {
                    emit({
                        type: "removed",
                        breaking: true,
                        path: `${schemaBasePath}.properties.${prop}`,
                        description: `Response field '${prop}' removed from ${opPath} (status ${statusCode})`,
                    });
                }
            }

            // Added response fields (non-breaking, DIFF-006)
            for (const prop of Object.keys(afterProps).sort()) {
                if (!(prop in beforeProps)) {
                    emit({
                        type: "added",
                        breaking: false,
                        path: `${schemaBasePath}.properties.${prop}`,
                        description: `Response field '${prop}' added to ${opPath} (status ${statusCode})`,
                    });
                }
            }
        }

        // Response type narrowing (DIFF-003 for responses)
        if (isTypeNarrowing(beforeSchema, afterSchema)) {
            emit({
                type: "modified",
                breaking: true,
                path: `${schemaBasePath}.type`,
                description: `Response type narrowed in ${opPath} (status ${statusCode})`,
                before: beforeSchema.type,
                after: afterSchema.type,
            });
        }
    }
}

// ---------------------------------------------------------------------------
// Security rules (DIFF-005)
// ---------------------------------------------------------------------------

export function diffSecurity(
    opPath: string,
    before: OperationObject,
    after: OperationObject,
    emit: Emit
): void {
    const beforeSec = before.security ?? [];
    const afterSec = after.security ?? [];

    const secKey = (req: Record<string, string[]>) => JSON.stringify(Object.keys(req).sort());

    const beforeKeys = new Set(beforeSec.map(secKey));
    const afterKeys = new Set(afterSec.map(secKey));

    for (const key of afterKeys) {
        if (!beforeKeys.has(key)) {
            emit({
                type: "added",
                breaking: true,
                path: `${opPath}.security`,
                description: `Security requirement added to ${opPath} — breaking`,
                before: beforeSec,
                after: afterSec,
            });
            return; // one entry per operation
        }
    }

    for (const key of beforeKeys) {
        if (!afterKeys.has(key)) {
            const removedAlternative = afterSec.length > 0;
            emit({
                type: "removed",
                breaking: removedAlternative,
                path: `${opPath}.security`,
                description: removedAlternative
                    ? `Security requirement alternative removed from ${opPath} — breaking`
                    : `Security requirement removed from ${opPath}`,
                before: beforeSec,
                after: afterSec,
            });
            return;
        }
    }
}

// ---------------------------------------------------------------------------
// Description / summary changes (non-breaking, DIFF-006)
// ---------------------------------------------------------------------------

export function diffMetadata(
    opPath: string,
    before: OperationObject,
    after: OperationObject,
    emit: Emit
): void {
    if (before.description !== after.description && (before.description || after.description)) {
        emit({
            type: "modified",
            breaking: false,
            path: `${opPath}.description`,
            description: `Description changed for ${opPath}`,
            before: before.description,
            after: after.description,
        });
    }

    if (before.summary !== after.summary && (before.summary || after.summary)) {
        emit({
            type: "modified",
            breaking: false,
            path: `${opPath}.summary`,
            description: `Summary changed for ${opPath}`,
            before: before.summary,
            after: after.summary,
        });
    }

    if (before.deprecated !== after.deprecated && after.deprecated) {
        emit({
            type: "modified",
            breaking: false,
            path: `${opPath}.deprecated`,
            description: `Endpoint ${opPath} marked as deprecated`,
            before: false,
            after: true,
        });
    }
}
