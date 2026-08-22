import { readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = resolve(root, 'src');
const allowedImplementationDependencies = new Set(['mcpfn', 'uifn']);
const concreteFunctionPackages = new Set(
  readdirSync(resolve(root, '..'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^[a-z][a-z0-9-]*fn$/i.test(entry.name))
    .map((entry) => entry.name.toLowerCase()),
);
const forbiddenCatalogSymbols = new Set(['KNOWN_MODULE_IDS', 'MODULE_CATALOG', 'NESTED_OWNERS', 'FOLDED_MODULE_IDS']);

/** @param {string} specifier */
function functionPackage(specifier) {
  const segments = specifier.split('/');
  const candidates = specifier.startsWith('@') ? [segments[0]?.slice(1), segments[1]] : [segments[0]];
  return candidates.find((candidate) => candidate && /^[a-z][a-z0-9-]*fn$/i.test(candidate));
}

/** @param {string} identifier */
function embeddedFunctionPackage(identifier) {
  const match = /^([A-Z]+Fn)(?=[A-Z_])/.exec(identifier)
    ?? /([A-Z][a-z0-9]*Fn)(?=[A-Z_])/.exec(identifier)
    ?? /^([a-z][a-z0-9]*Fn)(?=[A-Z_])/.exec(identifier);
  return match?.[1]?.toLowerCase();
}

/**
 * @param {string} source
 * @param {string} extension
 * @returns {Array<{ source: string; lineOffset: number }>}
 */
function sourceRegions(source, extension) {
  if (extension !== '.svelte') return [{ source, lineOffset: 0 }];
  const regions = [];
  const lower = source.toLowerCase();
  let cursor = 0;
  while (cursor < source.length) {
    const opening = lower.indexOf('<script', cursor);
    if (opening < 0) break;
    const afterName = lower[opening + '<script'.length];
    if (!['>', ' ', '\t', '\n', '\r'].includes(afterName)) {
      cursor = opening + '<script'.length;
      continue;
    }
    const openingEnd = source.indexOf('>', opening + '<script'.length);
    if (openingEnd < 0) break;
    const closing = lower.indexOf('</script', openingEnd + 1);
    if (closing < 0) break;
    const closingEnd = source.indexOf('>', closing + '</script'.length);
    if (closingEnd < 0) break;
    regions.push({
      source: source.slice(openingEnd + 1, closing),
      lineOffset: source.slice(0, openingEnd + 1).split('\n').length - 1,
    });
    cursor = closingEnd + 1;
  }
  return regions;
}

/** @param {string} directory @returns {string[]} */
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

/**
 * @param {string} source
 * @param {string} [file]
 * @returns {string[]}
 */
export function findFunctionAgnosticIssues(source, file = 'source.ts') {
  /** @type {Set<string>} */
  const findings = new Set();
  const extension = extname(file);
  for (const region of sourceRegions(source, extension)) {
    const ast = ts.createSourceFile(file, region.source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    /** @param {import('typescript').Node} node */
    const lineFor = (node) => ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1 + region.lineOffset;
    /** @param {import('typescript').Node} node */
    const visit = (node) => {
      const moduleSpecifier = (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
        ? node.moduleSpecifier
        : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
          ? node.arguments[0]
          : undefined;
      if (moduleSpecifier && ts.isStringLiteralLike(moduleSpecifier)) {
        const identifier = functionPackage(moduleSpecifier.text)?.toLowerCase();
        if (identifier && !allowedImplementationDependencies.has(identifier)) {
          findings.add(`${lineFor(moduleSpecifier)}: concrete function package import ${moduleSpecifier.text}`);
        }
      }
      if (ts.isIdentifier(node)) {
        if (forbiddenCatalogSymbols.has(node.text)) {
          findings.add(`${lineFor(node)}: fixed catalog symbol ${node.text}`);
        }
        const identifier = embeddedFunctionPackage(node.text);
        if (identifier && concreteFunctionPackages.has(identifier) && !allowedImplementationDependencies.has(identifier)) {
          findings.add(`${lineFor(node)}: concrete function identifier ${node.text}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(ast);
  }
  return [...findings];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const findings = [];
  for (const file of files(sourceRoot)) {
    if (!['.ts', '.js', '.mjs', '.cjs', '.svelte'].includes(extname(file))) continue;
    const source = readFileSync(file, 'utf8');
    findings.push(...findFunctionAgnosticIssues(source, file).map((finding) => `${relative(root, file)}:${finding}`));
  }
  if (findings.length) {
    console.error('Super Console core must remain function-agnostic:\n' + findings.map((finding) => `- ${finding}`).join('\n'));
    process.exitCode = 1;
  } else {
    console.log('Super Console function-agnostic source guard passed.');
  }
}
