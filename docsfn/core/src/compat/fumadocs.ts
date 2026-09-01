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

interface ImportSpecifier {
  imported: string;
  local: string;
}

function parseImportSpecifiers(source: string): ImportSpecifier[] {
  return source
    .split(",")
    .map((entry) => {
      const words = entry.trim().split(/\s+/);
      const alias = words.indexOf("as");
      const imported = words.slice(0, alias === -1 ? words.length : alias).join(" ");
      const local = alias === -1 ? imported : words.slice(alias + 1).join(" ");
      return { imported, local };
    })
    .filter((specifier) => specifier.imported.length > 0 && specifier.local.length > 0);
}

function parseNamedImport(line: string): { rawSpecifiers: string; moduleName: string } | null {
  const trimmed = line.trim().replace(/;$/, "").trimEnd();
  if (!trimmed.startsWith("import")) return null;
  const open = trimmed.indexOf("{");
  const close = trimmed.indexOf("}", open + 1);
  if (open === -1 || close === -1 || trimmed.slice(6, open).trim() !== "") return null;
  const from = trimmed.slice(close + 1).trim();
  if (!from.startsWith("from")) return null;
  const quoted = from.slice(4).trim();
  const quote = quoted[0];
  if ((quote !== '"' && quote !== "'") || quoted.at(-1) !== quote) return null;
  return { rawSpecifiers: trimmed.slice(open + 1, close), moduleName: quoted.slice(1, -1) };
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

function rewriteTag(source: string, local: string, canonical: "DocsTabs" | "DocsTab"): string {
  const escaped = local.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return source
    .replace(new RegExp(`<\\s*${escaped}(?=[\\s>])`, "g"), `<${canonical}`)
    .replace(new RegExp(`<\\s*\\/\\s*${escaped}\\s*>`, "g"), `</${canonical}>`);
}

function rewriteOutsideInlineCode(
  line: string,
  aliases: Map<string, "DocsTabs" | "DocsTab">
): string {
  return line
    .split(/(`+[^`]*`+)/g)
    .map((segment, index) => {
      if (index % 2 === 1) return segment;
      let rewritten = segment;
      for (const [local, canonical] of aliases) {
        rewritten = rewriteTag(rewritten, local, canonical);
      }
      return rewritten;
    })
    .join("");
}

export function transformFumadocsV15(
  input: FumadocsTransformInput
): FumadocsTransformResult {
  const lines = input.source.split(/\r?\n/);
  const keptLines: string[] = [];
  const importedComponents = new Set<string>();
  const aliases = new Map<string, "DocsTabs" | "DocsTab">();
  let fence: { marker: "`" | "~"; length: number } | null = null;

  for (const line of lines) {
    const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0] as "`" | "~";
      if (!fence) {
        fence = { marker, length: fenceMatch[1].length };
      } else if (fence.marker === marker && fenceMatch[1].length >= fence.length) {
        fence = null;
      }
      keptLines.push(line);
      continue;
    }
    if (fence) {
      keptLines.push(line);
      continue;
    }

    const importMatch = parseNamedImport(line);
    if (!importMatch) {
      keptLines.push(line);
      continue;
    }

    const { rawSpecifiers, moduleName } = importMatch;
    const specifiers = parseImportSpecifiers(rawSpecifiers);
    for (const specifier of specifiers) {
      importedComponents.add(specifier.local);
      if (moduleName.startsWith("fumadocs")) {
        validateFumadocsImport({
          sourcePath: input.sourcePath,
          moduleName,
          specifier: specifier.imported,
        });
        aliases.set(
          specifier.local,
          specifier.imported === "Tabs" ? "DocsTabs" : "DocsTab"
        );
      }
    }
  }

  let rewriteFence: { marker: "`" | "~"; length: number } | null = null;
  const transformed = keptLines
    .map((line) => {
      const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})/);
      if (fenceMatch) {
        const marker = fenceMatch[1][0] as "`" | "~";
        if (!rewriteFence) {
          rewriteFence = { marker, length: fenceMatch[1].length };
        } else if (rewriteFence.marker === marker && fenceMatch[1].length >= rewriteFence.length) {
          rewriteFence = null;
        }
        return line;
      }
      return rewriteFence ? line : rewriteOutsideInlineCode(line, aliases);
    })
    .join("\n");
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
