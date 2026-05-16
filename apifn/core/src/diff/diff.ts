/**
 * `diffOpenAPI(before, after)` — full breaking/non-breaking diff engine.
 *
 * Implements DIFF-001 through DIFF-009, Section 7.5 rules.
 *
 * The result is deterministic: given the same two documents, the output
 * is structurally identical (entries sorted by path). (DIFF-008)
 */

import type {
    DiffEntry,
    DiffResult,
    OpenAPIDocument,
    PathItemObject,
    OperationObject,
} from "../types.js";
import {
    HTTP_METHODS,
    diffParameters,
    diffRequestBody,
    diffResponses,
    diffSecurity,
    diffMetadata,
} from "./rules.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute breaking vs. non-breaking differences between two OpenAPI documents.
 *
 * @returns DiffResult with entries sorted deterministically by `path`.
 */
export function diffOpenAPI(before: OpenAPIDocument, after: OpenAPIDocument): DiffResult {
    const allEntries: DiffEntry[] = [];
    const emit = (entry: DiffEntry) => allEntries.push(entry);

    const beforePaths = before.paths ?? {};
    const afterPaths = after.paths ?? {};

    const allPaths = new Set([...Object.keys(beforePaths), ...Object.keys(afterPaths)]);

    for (const apiPath of [...allPaths].sort()) {
        const beforeItem = beforePaths[apiPath];
        const afterItem = afterPaths[apiPath];

        if (!beforeItem && afterItem) {
            // Entire path added (DIFF-006: non-breaking)
            for (const method of HTTP_METHODS) {
                const op = afterItem[method];
                if (op) {
                    emit({
                        type: "added",
                        breaking: false,
                        path: `paths.${apiPath}.${method}`,
                        description: `New endpoint ${method.toUpperCase()} ${apiPath} added`,
                    });
                }
            }
            continue;
        }

        if (beforeItem && !afterItem) {
            // Entire path removed — all methods are breaking (DIFF-001)
            for (const method of HTTP_METHODS) {
                const op = beforeItem[method];
                if (op) {
                    emit({
                        type: "removed",
                        breaking: true,
                        path: `paths.${apiPath}.${method}`,
                        description: `Endpoint ${method.toUpperCase()} ${apiPath} was removed`,
                    });
                }
            }
            continue;
        }

        if (!beforeItem || !afterItem) continue;

        // Both sides have the path — diff individual methods
        diffPathItem(apiPath, beforeItem, afterItem, emit);
    }

    // Sort deterministically by path (DIFF-008)
    allEntries.sort((a, b) => a.path.localeCompare(b.path));

    const breaking = allEntries.filter((e) => e.breaking);
    const nonBreaking = allEntries.filter((e) => !e.breaking);

    const added = allEntries.filter((e) => e.type === "added").length;
    const removed = allEntries.filter((e) => e.type === "removed").length;
    const modified = allEntries.filter((e) => e.type === "modified").length;

    return {
        breaking,
        nonBreaking,
        hasBreakingChanges: breaking.length > 0,
        summary: {
            added,
            removed,
            modified,
            breaking: breaking.length,
            nonBreaking: nonBreaking.length,
        },
    };
}

// ---------------------------------------------------------------------------
// Path-level diff
// ---------------------------------------------------------------------------

function diffPathItem(
    apiPath: string,
    before: PathItemObject,
    after: PathItemObject,
    emit: (entry: DiffEntry) => void
): void {
    for (const method of HTTP_METHODS) {
        const beforeOp = before[method] as OperationObject | undefined;
        const afterOp = after[method] as OperationObject | undefined;

        if (!beforeOp && afterOp) {
            // Method added on existing path (non-breaking, DIFF-006)
            emit({
                type: "added",
                breaking: false,
                path: `paths.${apiPath}.${method}`,
                description: `New endpoint ${method.toUpperCase()} ${apiPath} added`,
            });
            continue;
        }

        if (beforeOp && !afterOp) {
            // Method removed from existing path (breaking, DIFF-001)
            emit({
                type: "removed",
                breaking: true,
                path: `paths.${apiPath}.${method}`,
                description: `Endpoint ${method.toUpperCase()} ${apiPath} was removed`,
            });
            continue;
        }

        if (!beforeOp || !afterOp) continue;

        const opPath = `paths.${apiPath}.${method}`;
        diffParameters(opPath, beforeOp, afterOp, emit);
        diffRequestBody(opPath, beforeOp, afterOp, emit);
        diffResponses(opPath, beforeOp, afterOp, emit);
        diffSecurity(opPath, beforeOp, afterOp, emit);
        diffMetadata(opPath, beforeOp, afterOp, emit);
    }
}
