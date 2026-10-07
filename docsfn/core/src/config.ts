import { createRequire } from "node:module";
import { access, realpath } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createJiti } from "jiti";
import { configConditionsPlugin } from "./config-conditions";
import { z } from "zod";
import {
  createDiagnostic,
  createDocsError,
  type DocsError,
} from "./diagnostics";
import { normalizeDatedCollectionId } from "./provider";
import type { DocsConfig } from "./types";

export interface LoadDocsConfigInput {
  cwd: string;
  configPath?: string;
}

export const DEFAULT_CONFIG_FILENAMES = [
  "docsfn.config.ts",
  "docsfn.config.mjs",
  "docsfn.config.js",
] as const;

const docsVersionConfigSchema = z.object({
  slug: z
    .string()
    .regex(
      /^[A-Za-z0-9][A-Za-z0-9._-]*$/,
      "version slug must be a single safe path segment",
    ),
  label: z.string().min(1, "versions.versions[].label is required"),
  default: z.boolean().optional(),
});

const docsVersionsSchema = z
  .object({
    mode: z.enum(["none", "path-prefix", "path-segment"]),
    versions: z
      .array(docsVersionConfigSchema)
      .min(1, "versions.versions must contain at least one version"),
  })
  .superRefine((value, context) => {
    if (
      new Set(value.versions.map((version) => version.slug)).size !==
      value.versions.length
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["versions"],
        message: "version slugs must be unique",
      });
    }
    const defaultCount = value.versions.filter(
      (version) => version.default,
    ).length;
    if (defaultCount > 1 || (value.mode !== "none" && defaultCount !== 1)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["versions"],
        message: value.mode === "none" ? "versions.versions must mark at most one default version" : "versioned routing requires exactly one default version",
      });
    }
  });

const docsTopNavItemSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    label: z.string().min(1, "navigation.topNav[].label is required"),
    href: z.string().min(1, "navigation.topNav[].href is required"),
    external: z.boolean().optional(),
    children: z.array(docsTopNavItemSchema).optional(),
  })
);

export function isLocalRoute(value: string): boolean {
  // Framework catch-all parameters decode escapes; manifest keys must not retain them.
  if (/%[0-9a-f]{2}/i.test(value) || value.includes("//")) return false;
  if (!/^\/(?!\/)[^?#\\\u0000-\u0020]*$/.test(value)) return false;
  try {
    return value.split("/").every(segment => {
      const decoded = decodeURIComponent(segment);
      return decoded !== "." && decoded !== ".." && !/[\/\\\u0000-\u001f]/.test(decoded);
    });
  } catch { return false; }
}

const absoluteRouteSchema = (pathLabel: string) =>
  z
    .string()
    .optional()
    .refine(
      (value) => value === undefined || isLocalRoute(value),
      `${pathLabel} must start with '/'`
    );

const datedCollectionConfigSchema = z.object({
  type: z.literal("dated").optional(),
  dir: z.string().min(1, "collections.*.dir is required"),
  routeBase: z
    .string()
    .min(1, "collections.*.routeBase is required")
    .refine((value) => isLocalRoute(value), "collections.*.routeBase must start with '/'"),
  feedPath: absoluteRouteSchema("collections.*.feedPath"),
  label: z.string().min(1).optional(),
  scope: z.string().min(1).optional(),
});

const docsConfigSchema = z.object({
  schemaVersion: z.literal(1, {
    errorMap: () => ({ message: "schemaVersion must be 1" }),
  }),
  site: z.object({
    title: z.string().min(1, "site.title is required"),
    description: z.string().optional(),
    basePath: z
      .string()
      .optional()
      .refine((value) => value === undefined || isLocalRoute(value), "site.basePath must start with '/'"),
    canonicalUrl: z.string().url("site.canonicalUrl must be a valid URL").optional(),
    defaultLocale: z.string().min(1).optional(),
    showFooter: z.boolean().optional(),
    theme: z.record(z.unknown()).optional(),
    editLink: z.record(z.unknown()).optional(),
    pageActions: z.array(z.record(z.unknown())).optional(),
  }),
  compat: z
    .object({
      preset: z.enum(["none", "fumadocs-v15"], {
        errorMap: () => ({
          message: "compat.preset must be one of none or fumadocs-v15",
        }),
      }),
      allowRawHtml: z.literal(false).optional(),
    })
    .optional(),
  versions: docsVersionsSchema.optional(),
  content: z.object({
    root: z.string().min(1, "content.root is required"),
    docsDir: z
      .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
      .optional(),
    pagesDir: z.string().min(1).optional(),
    blogDir: z.string().min(1).optional(),
    apiDir: z.string().min(1).optional(),
    assetsDir: z.string().min(1).optional(),
    metaFileName: z.string().min(1).optional(),
  }),
  navigation: z
    .object({
      topNav: z.array(docsTopNavItemSchema).optional(),
      sidebars: z
        .record(
          z.object({
            title: z.string().optional(),
            root: z.boolean().optional(),
            include: z.array(z.string()).optional(),
          })
        )
        .optional(),
    })
    .optional(),
  blog: z
    .object({
      routeBase: absoluteRouteSchema("blog.routeBase"),
      feedPath: absoluteRouteSchema("blog.feedPath"),
    })
    .optional(),
  collections: z.record(datedCollectionConfigSchema).optional(),
  search: z
    .object({
      enabled: z.boolean(),
      scopes: z.array(z.string().min(1)),
      bodyIndexing: z.enum(["full", "summary", "disabled"]).optional(),
      maxArtifactBytes: z.number().int().positive().optional(),
      routeScopeOverrides: z
        .array(
          z.object({
            pattern: z.string().min(1, "search.routeScopeOverrides[].pattern is required"),
            scope: z.string().min(1, "search.routeScopeOverrides[].scope is required"),
          })
        )
        .optional(),
    })
    .optional(),
  auth: z
    .object({
      enabled: z.boolean(),
      mode: z.enum(["public", "private", "mixed"]),
    })
    .optional(),
  analytics: z
    .object({
      enabled: z.boolean(),
      provider: z.literal("watchfn"),
      respectDnt: z.boolean(),
    })
    .optional(),
}).superRefine((value, context) => {
  const seenNormalizedIds = new Map<string, string>();
  for (const collectionId of Object.keys(value.collections ?? {})) {
    const normalizedId = normalizeDatedCollectionId(collectionId);
    if (!normalizedId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["collections", collectionId],
        message: "collection id must normalize to a nonempty identifier",
      });
      continue;
    }
    if (normalizedId === "blog") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["collections", collectionId],
        message: "collection id is reserved for the legacy blog surface",
      });
    }
    const previousId = seenNormalizedIds.get(normalizedId);
    if (previousId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["collections", collectionId],
        message: `collection id collides with '${previousId}' after normalization`,
      });
      continue;
    }
    seenNormalizedIds.set(normalizedId, collectionId);
  }
});

export function createDefaultDocsConfig(input: { cwd: string }): DocsConfig {
  return {
    schemaVersion: 1,
    site: {
      title: "Docs",
      basePath: "/docs",
    },
    compat: {
      preset: "none",
    },
    content: {
      root: input.cwd,
      docsDir: "content/docs",
      pagesDir: "pages",
      blogDir: "blog",
      apiDir: "api",
      assetsDir: "public",
      metaFileName: "meta.json",
    },
    search: {
      enabled: true,
      scopes: ["docs"],
      bodyIndexing: "summary",
    },
    auth: {
      enabled: false,
      mode: "public",
    },
    analytics: {
      enabled: false,
      provider: "watchfn",
      respectDnt: true,
    },
  };
}

/** Load one config snapshot per host process, preserving live export values.
 * Restart the host to observe dependency changes or recover evaluation errors.
 */
export async function loadDocsConfig(input: LoadDocsConfigInput): Promise<DocsConfig> {
  const cwd = resolve(input.cwd);
  const discoveredConfigPath = await discoverConfigPath({
    cwd,
    configPath: input.configPath,
  });

  if (!discoveredConfigPath) {
    return createDefaultDocsConfig({ cwd });
  }

  const loadedConfig = await loadConfigModule(discoveredConfigPath);
  return validateDocsConfig(loadedConfig, discoveredConfigPath);
}

async function discoverConfigPath(input: {
  cwd: string;
  configPath?: string;
}): Promise<string | null> {
  if (input.configPath) {
    const explicitPath = isAbsolute(input.configPath)
      ? input.configPath
      : resolve(input.cwd, input.configPath);

    if (!(await fileExists(explicitPath))) {
      throw createDocsError({
        code: "DOCS_CONFIG_INVALID",
        message: `docsfn config file does not exist at ${explicitPath}`,
        diagnostics: [
          createDiagnostic({
            code: "DOCS_CONFIG_INVALID",
            message: `docsfn config file does not exist at ${explicitPath}`,
            location: { absolutePath: explicitPath },
          }),
        ],
      });
    }

    return explicitPath;
  }

  for (const fileName of DEFAULT_CONFIG_FILENAMES) {
    const candidate = resolve(input.cwd, fileName);
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch (error) {
    if (["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) return false;
    throw error;
  }
}

// Config exports (including async factories and live values) belong to one host
// process. A fresh process is the reload boundary; never mutate Node's caches.
const configLoads = new Map<string, Promise<unknown>>();
const configWatchPaths = new Map<string, string[]>();

async function loadConfigModule(configPath: string): Promise<unknown> {
  const requested = resolve(configPath);
  let pending = configLoads.get(requested);
  if (!pending) {
    pending = (async () => {
      // Native resolution applies realpath/symlink flags to the config entry.
      const resolved = createRequire(requested).resolve(requested);
      configWatchPaths.set(requested, [requested, resolved, dirname(requested), dirname(resolved)]);
      const jiti = createJiti(pathToFileURL(resolved).href, {
        fsCache: false,
        moduleCache: true,
        interopDefault: false,
        transformOptions: { babel: { plugins: [() => ({
          // Jiti enables importAssertions for TypeScript, while its JS parser
          // uses importAttributes. Babel prohibits combining the former with
          // deprecatedImportAssert; normalize those parser options together.
          manipulateOptions(_options: unknown, parser: { plugins: unknown[] }) {
            parser.plugins = parser.plugins.filter(plugin => plugin !== "importAssertions");
            parser.plugins.push("deprecatedImportAssert");
          },
        }), configConditionsPlugin] } },
      });
      const moduleValue = await jiti.import(resolved);
      const candidate = moduleValue && typeof moduleValue === "object" && "default" in moduleValue
        ? (moduleValue as { default: unknown }).default : moduleValue;
      return typeof candidate === "function" ? await candidate() : candidate;
    })();
    // Cache failures too: changes or repairs require restarting the host. CLI
    // dev uses a new build process and keeps the bootstrap watcher alive.
    configLoads.set(requested, pending);
  }
  try {
    return await pending;
  } catch (error) {
    throw createDocsError({
      code: "DOCS_CONFIG_INVALID",
      message: `failed to load docsfn config at ${configPath}`,
      diagnostics: [createDiagnostic({
        code: "DOCS_CONFIG_INVALID",
        message: `failed to load docsfn config at ${configPath}`,
        location: { absolutePath: configPath },
        details: { error: error instanceof Error ? error.message : String(error) },
      })],
      cause: error,
    });
  }
}

/**
 * @deprecated Watch project/config directories with getDocsConfigWatchRoots.
 * Returns bootstrap files/directories, not an exhaustive transitive import graph.
 */
export function getDocsConfigDependencies(configPath: string): string[] {
  const requested = resolve(configPath);
  return [...new Set(configWatchPaths.get(requested) ?? [requested, dirname(requested)])];
}

/** Bootstrap watch roots are available even when config discovery/evaluation fails. */
export async function getDocsConfigWatchRoots(input: LoadDocsConfigInput & { watchRoots?: string[] }): Promise<string[]> {
  const cwd = resolve(input.cwd);
  const configPath = input.configPath ? resolve(cwd, input.configPath) : undefined;
  const directories = [cwd, ...(configPath ? [dirname(configPath)] : []),
    ...(input.watchRoots ?? []).map(root => resolve(cwd, root))];
  const files = configPath ? [configPath] : DEFAULT_CONFIG_FILENAMES.map(name => resolve(cwd, name));
  const roots = new Set(directories);
  const physicalPath = async (file: string): Promise<string | undefined> => {
    try { return await realpath(file); }
    catch (error) {
      if (!["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
      return undefined;
    }
  };
  for (const directory of directories) {
    const physical = await physicalPath(directory);
    if (physical) roots.add(physical);
  }
  for (const file of files) {
    const physical = await physicalPath(file);
    if (physical) roots.add(dirname(physical));
  }
  // Package scope can live above the watched project/config directory. Watch
  // its manifest as a file rather than recursively subscribing to that ancestor.
  for (const directory of [...roots]) {
    let ancestor = directory;
    while (true) {
      const manifest = resolve(ancestor, "package.json");
      if (await fileExists(manifest)) { roots.add(manifest); break; }
      const parent = dirname(ancestor);
      if (parent === ancestor) break;
      ancestor = parent;
    }
  }
  return [...roots].sort();
}

export function validateDocsConfig(loadedConfig: unknown, configPath = "docsfn.config"): DocsConfig {
  const parsed = docsConfigSchema.safeParse(loadedConfig);
  if (parsed.success) {
    return parsed.data as DocsConfig;
  }

  const message = formatConfigValidationMessage(parsed.error.issues);
  const diagnostics = [
    createDiagnostic({
      code: "DOCS_CONFIG_INVALID",
      message,
      location: {
        absolutePath: configPath,
      },
      details: {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
          code: issue.code,
        })),
      },
    }),
  ];

  throw createDocsError({
    code: "DOCS_CONFIG_INVALID",
    message,
    diagnostics,
  });
}

function formatConfigValidationMessage(
  issues: Array<{ path: Array<string | number>; message: string }>
): string {
  const mappedMessages = issues.map((issue) => {
    const path = issue.path.map(String).join(".");

    if (path === "schemaVersion") {
      return "schemaVersion must be 1";
    }

    if (path === "site.basePath") {
      return "site.basePath must start with '/'";
    }

    if (path === "compat.preset") {
      return "compat.preset must be one of none or fumadocs-v15";
    }

    return path ? `${path} ${issue.message}` : issue.message;
  });

  return Array.from(new Set(mappedMessages)).join(" and ");
}

export function isDocsConfigError(value: unknown): value is DocsError {
  return (
    value instanceof Error &&
    "name" in value &&
    value.name === "DocsError" &&
    "code" in value
  );
}
