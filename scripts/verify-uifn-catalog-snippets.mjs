import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { compile as compileSvelte } from "svelte/compiler";

const repoRoot = path.resolve(import.meta.dirname, "..");
const shared = await import(pathToFileURL(
  path.join(repoRoot, "uifn", "examples", "shared", "dist", "index.js")
).href);
const components = await import(pathToFileURL(
  path.join(repoRoot, "uifn", "components", "dist", "index.mjs")
).href);
const frameworks = ["react", "svelte", "solid"];
const checks = [];
const findings = [];

for (const component of components.STYLED_COMPONENT_CATALOG) {
  const expectedExports = [
    component.demo.root.exportName,
    ...component.demo.parts.map((part) => part.exportName),
  ];
  for (const framework of frameworks) {
    const code = shared.catalogComponentCodeSnippet(component.id, framework);
    const packagePath = `@uifn/components-${framework}/${component.id}`;
    const modulePath = framework === "svelte"
      ? path.join(repoRoot, "uifn", "components-svelte", "dist", "generated", component.id, "index.js")
      : path.join(repoRoot, "uifn", `components-${framework}`, "dist", "generated", `${component.id}.mjs`);
    const moduleSource = fs.readFileSync(modulePath, "utf8");
    const moduleExports = collectModuleExports(moduleSource);
    const missingExports = expectedExports.filter((exportName) => !moduleExports.has(exportName));
    const syntaxErrors = [];

    if (!code.includes(`from '${packagePath}'`)) {
      syntaxErrors.push(`Missing component subpath import: ${packagePath}`);
    }
    if (!code.includes("import '@uifn/components/styles.css'")) {
      syntaxErrors.push("Missing shared stylesheet import");
    }
    try {
      if (framework === "svelte") {
        compileSvelte(code, {
          filename: `${component.id}.svelte`,
          generate: "client",
          modernAst: true,
        });
      } else {
        const result = ts.transpileModule(code, {
          fileName: `${component.id}.${framework === "react" ? "tsx" : "tsx"}`,
          reportDiagnostics: true,
          compilerOptions: {
            jsx: ts.JsxEmit.Preserve,
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
          },
        });
        for (const diagnostic of result.diagnostics ?? []) {
          if (diagnostic.category !== ts.DiagnosticCategory.Error) continue;
          syntaxErrors.push(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
        }
      }
    } catch (error) {
      syntaxErrors.push(error instanceof Error ? error.message : String(error));
    }

    const ok = missingExports.length === 0 && syntaxErrors.length === 0;
    checks.push({
      component: component.id,
      framework,
      ok,
      exportCount: expectedExports.length,
      codeLength: code.length,
      missingExports,
      syntaxErrors,
    });
    if (!ok) {
      findings.push({
        component: component.id,
        framework,
        missingExports,
        syntaxErrors,
      });
    }
  }
}

const result = {
  ok: findings.length === 0,
  command: "verify:uifn-catalog-snippets",
  componentCount: components.STYLED_COMPONENT_CATALOG.length,
  frameworkCount: frameworks.length,
  checkCount: checks.length,
  checks,
  findings,
};

console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exit(1);

function collectModuleExports(source) {
  const names = new Set();
  for (const match of source.matchAll(/export\s+(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)) {
    names.add(match[1]);
  }
  for (const match of source.matchAll(/export\s*\{([\s\S]*?)\}/g)) {
    for (const item of match[1].split(",")) {
      const name = item.trim().split(/\s+as\s+/).at(-1)?.trim();
      if (name) names.add(name);
    }
  }
  return names;
}
