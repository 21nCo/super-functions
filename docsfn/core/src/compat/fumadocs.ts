import { createDiagnostic, createDocsError } from "../diagnostics";

const SUPPORTED_FUMADOCS_IMPORTS: Record<string, Set<string>> = {
  "fumadocs-ui/components/tabs": new Set(["Tabs", "Tab"]),
};

export interface FumadocsTransformInput {
  source: string;
  sourcePath?: string;
}

export interface FumadocsTransformResult {
  transformed: string;
  importedComponents: Set<string>;
  componentsUsed: string[];
}

function parseImportSpecifiers(source: string): string[] {
  return source
    .split(",")
    .map((entry) => entry.trim())
    .map((entry) => entry.replace(/\s+as\s+.+$/, "").trim())
    .filter(Boolean);
}

function validateFumadocsImport(input: {
  sourcePath?: string;
  moduleName: string;
  specifier: string;
}): void {
  const supported = SUPPORTED_FUMADOCS_IMPORTS[input.moduleName];
  if (supported && supported.has(input.specifier)) {
    return;
  }

  throw createDocsError({
    code: "DOCS_COMPAT_UNSUPPORTED",
    message: `unsupported compatibility construct ${input.specifier} from ${input.moduleName}`,
    diagnostics: [
      createDiagnostic({
        code: "DOCS_COMPAT_UNSUPPORTED",
        message: `unsupported compatibility construct ${input.specifier} from ${input.moduleName}`,
        location: {
          absolutePath: input.sourcePath,
        },
        details: {
          component: input.specifier,
          module: input.moduleName,
        },
      }),
    ],
  });
}

function rewriteFumadocsTags(source: string): string {
  return source
    .replace(/<\s*Tabs(?=[\s>])/g, "<DocsTabs")
    .replace(/<\s*\/\s*Tabs\s*>/g, "</DocsTabs>")
    .replace(/<\s*Tab(?=[\s>])/g, "<DocsTab")
    .replace(/<\s*\/\s*Tab\s*>/g, "</DocsTab>");
}

export function transformFumadocsV15(
  input: FumadocsTransformInput
): FumadocsTransformResult {
  const lines = input.source.split(/\r?\n/);
  const keptLines: string[] = [];
  const importedComponents = new Set<string>();

  for (const line of lines) {
    const importMatch = line.match(
      /^\s*import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["']\s*;?\s*$/
    );
    if (!importMatch) {
      keptLines.push(line);
      continue;
    }

    const [, rawSpecifiers, moduleName] = importMatch;
    const specifiers = parseImportSpecifiers(rawSpecifiers);
    for (const specifier of specifiers) {
      importedComponents.add(specifier);
      if (moduleName.startsWith("fumadocs")) {
        validateFumadocsImport({
          sourcePath: input.sourcePath,
          moduleName,
          specifier,
        });
      }
    }
  }

  const transformed = rewriteFumadocsTags(keptLines.join("\n"));
  const componentsUsed: string[] = [];

  if (/<\s*DocsTabs(?=[\s>])/.test(transformed)) {
    componentsUsed.push("DocsTabs");
  }
  if (/<\s*DocsTab(?=[\s>])/.test(transformed)) {
    componentsUsed.push("DocsTab");
  }
  if (/```mermaid/.test(transformed)) {
    componentsUsed.push("MermaidBlock");
  }

  return {
    transformed,
    importedComponents,
    componentsUsed,
  };
}
