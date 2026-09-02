import { randomBytes } from "node:crypto";
import { access, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
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
  slug: z.string().min(1, "versions.versions[].slug is required"),
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
    const defaultCount = value.versions.filter((version) => version.default).length;
    if (defaultCount > 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["versions"],
        message: "versions.versions must mark at most one default version",
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

const absoluteRouteSchema = (pathLabel: string) =>
  z
    .string()
    .optional()
    .refine(
      (value) => value === undefined || value.startsWith("/"),
      `${pathLabel} must start with '/'`
    );

const datedCollectionConfigSchema = z.object({
  type: z.literal("dated").optional(),
  dir: z.string().min(1, "collections.*.dir is required"),
  routeBase: z
    .string()
    .min(1, "collections.*.routeBase is required")
    .refine((value) => value.startsWith("/"), "collections.*.routeBase must start with '/'"),
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
      .refine((value) => value === undefined || value.startsWith("/"), "site.basePath must start with '/'"),
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
  for (const collectionId of Object.keys(value.collections ?? {})) {
    if (normalizeDatedCollectionId(collectionId) === "blog") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["collections", collectionId],
        message: "collection id is reserved for the legacy blog surface",
      });
    }
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
  } catch {
    return false;
  }
}

async function loadConfigModule(configPath: string): Promise<unknown> {
  try {
    if (extname(configPath) === ".ts") {
      return await loadTypeScriptConfig(configPath);
    }

    const moduleValue = await import(await resolveConfigModuleUrl(configPath));
    return resolveConfigExport(moduleValue);
  } catch (error) {
    throw createDocsError({
      code: "DOCS_CONFIG_INVALID",
      message: `failed to load docsfn config at ${configPath}`,
      diagnostics: [
        createDiagnostic({
          code: "DOCS_CONFIG_INVALID",
          message: `failed to load docsfn config at ${configPath}`,
          location: { absolutePath: configPath },
          details: {
            error: error instanceof Error ? error.message : String(error),
          },
        }),
      ],
      cause: error,
    });
  }
}

async function loadTypeScriptConfig(configPath: string): Promise<unknown> {
  try {
    const moduleValue = await import(await resolveConfigModuleUrl(configPath));
    return resolveConfigExport(moduleValue);
  } catch {
    const typescriptModuleName = process.env.DOCSFN_TYPESCRIPT_MODULE ?? "typescript";
    const typescript: typeof import("typescript") = await import(
      typescriptModuleName
    );
    const source = await readFile(configPath, "utf8");
    const transpiled = typescript.transpileModule(source, {
      compilerOptions: {
        module: typescript.ModuleKind.ESNext,
        target: typescript.ScriptTarget.ES2022,
      },
      fileName: configPath,
    });
    const compiledPath = join(
      dirname(configPath),
      `.docsfn.${randomBytes(16).toString("hex")}.mjs`
    );
    await writeFile(compiledPath, transpiled.outputText, {
      encoding: "utf8",
      mode: 0o600,
    });
    try {
      const moduleValue = await import(await resolveConfigModuleUrl(compiledPath));
      return resolveConfigExport(moduleValue);
    } finally {
      await unlink(compiledPath).catch(() => undefined);
    }
  }
}

async function resolveConfigModuleUrl(configPath: string): Promise<string> {
  const configUrl = pathToFileURL(configPath);
  const fileStats = await stat(configPath);
  configUrl.searchParams.set("docsfnUpdatedAt", String(fileStats.mtimeMs));
  return configUrl.href;
}

function resolveConfigExport(moduleValue: unknown): unknown {
  const candidate =
    typeof moduleValue === "object" &&
    moduleValue !== null &&
    "default" in moduleValue
      ? (moduleValue as { default: unknown }).default
      : moduleValue;

  return typeof candidate === "function" ? (candidate as () => unknown)() : candidate;
}

function validateDocsConfig(loadedConfig: unknown, configPath: string): DocsConfig {
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
