/**
 * createApifnProvider — DocsContentProvider implementation (DOCS-001, DOCS-004, DOCS-006).
 *
 * Accepts an OpenAPI document (object or file path), groups endpoints by tag,
 * and returns RawContentEntry[] suitable for docsfn's manifest pipeline.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseOpenAPI, type OpenAPIDocument, type OperationObject } from "@apifn/core";
import type {
    CreateApifnProviderOptions,
    DocsContentProvider,
    RawContentEntry,
    ApiEndpoint,
    SidebarGroup,
    SidebarLink,
} from "./types.js";

const HTTP_METHODS = [
    "get", "post", "put", "patch", "delete", "head", "options",
] as const;

type OperationParameters = NonNullable<OperationObject["parameters"]>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function tagToSlug(tag: string, basePath: string): string {
    const segment = tag.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    return `${basePath.replace(/\/$/, "")}/${segment}`;
}

function collectEndpoints(spec: OpenAPIDocument): ApiEndpoint[] {
    const items: ApiEndpoint[] = [];
    for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
        if (!pathItem) continue;
        const pathParameters = Array.isArray(pathItem.parameters) ? pathItem.parameters : [];
        for (const method of HTTP_METHODS) {
            const op = pathItem[method] as OperationObject | undefined;
            if (!op) continue;
            const operation = mergePathParameters(pathParameters, op);
            const tags = (op.tags as string[]) ?? ["default"];
            items.push({ path, method, operation, tag: tags[0] ?? "default" });
        }
    }
    return items;
}

function parameterKey(parameter: unknown): string | undefined {
    if (!parameter || typeof parameter !== "object") {
        return undefined;
    }

    const reference = parameter as { $ref?: unknown };
    if (typeof reference.$ref === "string") {
        return `$ref:${reference.$ref}`;
    }

    const candidate = parameter as { name?: unknown; in?: unknown };
    if (typeof candidate.name !== "string" || typeof candidate.in !== "string") {
        return undefined;
    }

    return `${candidate.in}:${candidate.name}`;
}

function mergePathParameters(pathParameters: OperationParameters, operation: OperationObject): OperationObject {
    if (pathParameters.length === 0) {
        return operation;
    }

    const operationParameters: OperationParameters = Array.isArray(operation.parameters) ? operation.parameters : [];
    const operationKeys = new Set(operationParameters.map(parameterKey).filter((key): key is string => Boolean(key)));
    const inheritedParameters = pathParameters.filter((parameter) => {
        const key = parameterKey(parameter);
        return !key || !operationKeys.has(key);
    });

    if (inheritedParameters.length === 0) {
        return operation;
    }

    return {
        ...operation,
        parameters: [...inheritedParameters, ...operationParameters],
    };
}

function buildSidebarGroup(
    groupLabel: string,
    endpoints: ApiEndpoint[],
    slug: string
): SidebarGroup {
    const links: SidebarLink[] = endpoints.map((e) => ({
        type: "link",
        label: `${e.method.toUpperCase()} ${e.path}`,
        href: `${slug}#${e.method.toLowerCase()}-${e.path.replace(/[^a-z0-9]/gi, "-")}`,
    }));
    return { type: "group", label: groupLabel, items: links };
}

function buildEntries(
    spec: OpenAPIDocument,
    options: CreateApifnProviderOptions
): RawContentEntry[] {
    const {
        basePath = "/api",
        splitByTag = true,
    } = options;

    const info = spec.info as { title?: string; version?: string } | undefined;
    const allEndpoints = collectEndpoints(spec);

    if (!splitByTag) {
        // Single full-spec entry
        const slug = basePath.replace(/\/$/, "") || "/api";
        const title = info?.title ?? "API Reference";
        const sidebar = buildSidebarGroup(title, allEndpoints, slug);
        return [{
            kind: "api",
            slug,
            title,
            endpoints: allEndpoints,
            sidebar,
            spec,
        }];
    }

    // Split by tag — one entry per tag (DOCS-006)
    const tagMap = new Map<string, ApiEndpoint[]>();
    for (const endpoint of allEndpoints) {
        if (!tagMap.has(endpoint.tag)) tagMap.set(endpoint.tag, []);
        tagMap.get(endpoint.tag)!.push(endpoint);
    }

    return [...tagMap.entries()].map(([tag, endpoints]) => {
        const slug = tagToSlug(tag, basePath);
        const title = `${tag.charAt(0).toUpperCase()}${tag.slice(1)}`;
        const sidebar = buildSidebarGroup(title, endpoints, slug);
        return {
            kind: "api" as const,
            slug,
            title,
            tag,
            endpoints,
            sidebar,
            spec,
        };
    });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Creates a DocsContentProvider that produces RawContentEntry[] for docsfn.
 *
 * @example
 * const provider = createApifnProvider({ specPath: "./openapi.yml", splitByTag: true });
 * const entries = await provider();
 */
export function createApifnProvider(
    options: CreateApifnProviderOptions
): DocsContentProvider {
    let cachedEntries: RawContentEntry[] | null = null;

    async function loadSpec(): Promise<OpenAPIDocument> {
        if (options.spec) return options.spec;
        if (options.specPath) {
            const abs = resolve(options.specPath);
            const raw = await readFile(abs, "utf8");
            return parseOpenAPI(raw);
        }
        throw new Error("createApifnProvider: must provide either `spec` or `specPath`");
    }

    const provider = async (): Promise<RawContentEntry[]> => {
        if (cachedEntries) return cachedEntries;
        const spec = await loadSpec();
        cachedEntries = buildEntries(spec, options);
        provider.entries = cachedEntries;
        return cachedEntries;
    };

    provider.entries = [] as RawContentEntry[];
    return provider as DocsContentProvider;
}
