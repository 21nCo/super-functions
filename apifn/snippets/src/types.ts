/**
 * @apifn/snippets — Types
 */

import type { OperationObject, SnippetTarget, SnippetOptions } from "@apifn/core";

export type { SnippetTarget, SnippetOptions };

/** A snippet target generator */
export interface SnippetTargetGenerator {
    generate(
        operation: OperationObject,
        apiPath: string,
        method: string,
        options: SnippetOptions
    ): string;
}

/** The resolved operation details passed to targets */
export interface SnippetContext {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: string;
    indent: string;
}

/** A snippet for one operation across all (or selected) targets */
export interface OperationSnippet {
    path: string;
    method: string;
    operationId?: string;
    target: SnippetTarget;
    code: string;
}

/** Result from generateAllSnippets */
export interface AllSnippetsResult {
    snippets: OperationSnippet[];
}
