import { resolveExtensions, type EditorState, type MdfnDocument, type MdfnExtension, type MdfnJsonValue, type MdfnNode } from "@mdfn/core";
import { parseMarkdown, serializeMarkdown, type MarkdownOptions } from "@mdfn/markdown";
import { renderHtml, type RenderPolicy } from "@mdfn/render";
import { parseFragment, serialize } from "parse5";

export interface PreservationFixture {
  readonly id: string;
  readonly source: string;
  readonly options?: MarkdownOptions;
}

export interface ConformanceFinding {
  readonly code: string;
  readonly fixture: string;
  readonly message: string;
}

export interface ConformanceResult {
  readonly ok: boolean;
  readonly passed: number;
  readonly failed: number;
  readonly findings: readonly ConformanceFinding[];
}

export function runPreservationCorpus(fixtures: readonly PreservationFixture[]): ConformanceResult {
  const findings: ConformanceFinding[] = [];
  let passed = 0;
  for (const fixture of fixtures) {
    try {
      const parsed = parseMarkdown(fixture.source, fixture.options);
      const serialized = serializeMarkdown({ document: parsed.document, originalSource: fixture.source, options: fixture.options });
      if (serialized.markdown !== fixture.source) {
        findings.push({ code: "MDFN_CONFORMANCE_NO_EDIT_CHANGED", fixture: fixture.id, message: "No-edit round trip changed source bytes" });
      } else if (!serialized.preservation.exactUntouched) {
        findings.push({ code: "MDFN_CONFORMANCE_EXACT_NOT_REPORTED", fixture: fixture.id, message: "Exact preservation was not reported" });
      } else {
        passed += 1;
      }
    } catch (error) {
      findings.push({ code: "MDFN_CONFORMANCE_EXCEPTION", fixture: fixture.id, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return { ok: findings.length === 0, passed, failed: findings.length, findings };
}

export function certifyExtension(extension: MdfnExtension, fixture: PreservationFixture): ConformanceResult {
  const configured = fixture.options?.extensions;
  const existing = configured ? ("schemaHash" in configured ? configured.extensions : configured) : [];
  const options = { ...(fixture.options ?? {}), extensions: [...existing, extension] };
  const findings = [...runPreservationCorpus([{ ...fixture, options }]).findings];
  let passed = findings.length === 0 ? 1 : 0;
  try {
    const registry = resolveExtensions(options.extensions);
    const parsed = parseMarkdown(fixture.source, options);
    const owns = (node: MdfnNode): boolean => extension.serializeMarkdown?.({ node }) != null || (node.content?.some(owns) ?? false);
    const dirty = (node: MdfnNode): MdfnNode => owns(node)
      ? { ...node, source: node.source ? { ...node.source, dirty: true } : undefined, content: node.content?.map(dirty) }
      : { ...node, content: node.content?.map(dirty) };
    const edited = dirty(parsed.document) as MdfnDocument;
    const ownedNodes: MdfnNode[] = [];
    const collectOwned = (node: MdfnNode): void => {
      if (extension.serializeMarkdown?.({ node }) != null) ownedNodes.push(node);
      node.content?.forEach(collectOwned);
    };
    collectOwned(parsed.document);
    if (ownedNodes.length === 0) findings.push({ code: "MDFN_CERT_FIXTURE_NOT_OWNED", fixture: fixture.id, message: "Extension did not claim any syntax in its certification fixture" });
    const serialized = serializeMarkdown({ document: edited, originalSource: fixture.source, options });
    if (!serialized.markdown) findings.push({ code: "MDFN_CERT_EDITED_SERIALIZATION_EMPTY", fixture: fixture.id, message: "Edited serialization produced no source" });
    else passed += 1;
    renderHtml(edited, { extensions: registry, rawHtml: { enabled: false } });
    passed += 1;
    if (extension.visual) {
      const visual = ownedNodes.map((node) => extension.visual?.({ node, escape: (value) => value })).filter(Boolean);
      if (visual.length === 0 || visual.some((node) => typeof node !== "object" || !node?.tag)) findings.push({ code: "MDFN_CERT_VISUAL_INVALID", fixture: fixture.id, message: "Visual lifecycle did not produce a structured node" });
      else passed += 1;
    }
    registry.diagnose(edited);
    passed += 1;
    for (const migration of extension.migrations ?? []) migration.migrate(parsed.document);
    passed += 1;
    const manifest = extension.certification;
    if (manifest) {
      if (manifest.schemaVersion !== 1 || !manifest.fixtures.includes(fixture.id)) findings.push({ code: "MDFN_CERT_MANIFEST_INVALID", fixture: fixture.id, message: "Certification manifest does not cover the fixture" });
      const hooks: Record<string, unknown> = { parse: extension.parseMarkdown, serialize: extension.serializeMarkdown, render: extension.render, visual: extension.visual, commands: extension.commands, keymap: extension.keymap, input: extension.inputRules, paste: extension.pasteRules, plugins: extension.plugins, diagnostics: extension.diagnostics, migrations: extension.migrations, security: extension.security };
      for (const capability of manifest.capabilities) if (!hooks[capability]) findings.push({ code: "MDFN_CERT_CAPABILITY_MISSING", fixture: fixture.id, message: `Manifest capability ${capability} has no hook` });
    }
  } catch (error) {
    findings.push({ code: "MDFN_CERT_LIFECYCLE_EXCEPTION", fixture: fixture.id, message: error instanceof Error ? error.message : String(error) });
  }
  return { ok: findings.length === 0, passed, failed: findings.length, findings };
}

export interface SemanticFixture extends PreservationFixture { readonly expectedHtml: string; }

function canonicalHtml(value: string): string {
  const fragment = parseFragment(value);
  const visit = (node: unknown, preserveWhitespace = false): void => {
    if (!node || typeof node !== "object") return;
    const candidate = node as { nodeName?: string; value?: string; attrs?: Array<{ name: string; value: string }>; childNodes?: unknown[] };
    const preserve = preserveWhitespace || candidate.nodeName === "pre" || candidate.nodeName === "code";
    if (candidate.nodeName === "#text" && !preserve && typeof candidate.value === "string") candidate.value = candidate.value.replace(/\s+/g, " ");
    if (candidate.attrs) candidate.attrs = candidate.attrs.filter((attr) => !["target", "rel", "loading", "decoding", "href", "src"].includes(attr.name)).sort((a, b) => a.name.localeCompare(b.name));
    if (candidate.childNodes) {
      candidate.childNodes = candidate.childNodes.filter((child) => {
        const text = child as { nodeName?: string; value?: string };
        return preserve || text.nodeName !== "#text" || Boolean(text.value?.trim());
      });
      for (let index = 0; index < candidate.childNodes.length; index += 1) {
        const child = candidate.childNodes[index] as { nodeName?: string; value?: string };
        const previous = candidate.childNodes[index - 1] as { nodeName?: string } | undefined;
        const next = candidate.childNodes[index + 1] as { nodeName?: string } | undefined;
        if (child.nodeName === "#text" && typeof child.value === "string") {
          if (previous?.nodeName === "br" || previous?.nodeName === "ul" || previous?.nodeName === "ol" || previous?.nodeName === "blockquote" || previous?.nodeName === "pre" || /^h[1-6]$/.test(previous?.nodeName ?? "")) child.value = child.value.trimStart();
          if (next?.nodeName === "ul" || next?.nodeName === "ol" || next?.nodeName === "blockquote" || next?.nodeName === "pre" || /^h[1-6]$/.test(next?.nodeName ?? "")) child.value = child.value.trimEnd();
        }
      }
      candidate.childNodes.forEach((child) => visit(child, preserve));
    }
  };
  visit(fragment);
  return serialize(fragment).trim();
}

/** Compare MDFN's projected semantics with authoritative expected HTML. */
export function runSemanticCorpus(fixtures: readonly SemanticFixture[]): ConformanceResult {
  const findings: ConformanceFinding[] = [];
  let passed = 0;
  for (const fixture of fixtures) {
    try {
      const parsed = parseMarkdown(fixture.source, fixture.options);
      const neutralizeUrls = (node: MdfnNode): MdfnNode => node.type === "link"
        ? { ...node, attrs: { ...node.attrs, url: "#" }, content: node.content?.map(neutralizeUrls) }
        : node.type === "image" ? { ...node, attrs: { ...node.attrs, url: "/image" } }
          : { ...node, content: node.content?.map(neutralizeUrls) };
      const document = neutralizeUrls(parsed.document) as MdfnDocument;
      const actual = renderHtml(document, { extensions: fixture.options?.extensions, rawHtml: { enabled: true, sanitize: (raw) => raw }, links: { externalTarget: null, externalRel: "" } }).html;
      if (canonicalHtml(actual) !== canonicalHtml(fixture.expectedHtml)) findings.push({ code: "MDFN_CONFORMANCE_SEMANTIC_MISMATCH", fixture: fixture.id, message: `Expected ${canonicalHtml(fixture.expectedHtml)} but received ${canonicalHtml(actual)}` });
      else passed += 1;
    } catch (error) {
      findings.push({ code: "MDFN_CONFORMANCE_SEMANTIC_EXCEPTION", fixture: fixture.id, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return { ok: findings.length === 0, passed, failed: findings.length, findings };
}

/** Representative examples copied from the normative GFM 0.29 test blocks. */
export const authoritativeGfmCorpus: readonly SemanticFixture[] = Object.freeze([
  { id: "gfm-autolink-www", source: "www.commonmark.org\n", expectedHtml: '<p><a href="http://www.commonmark.org">www.commonmark.org</a></p>', options: { dialect: "gfm" } },
  { id: "gfm-autolink-email", source: "foo.bar.baz@google.com\n", expectedHtml: '<p><a href="mailto:foo.bar.baz@google.com">foo.bar.baz@google.com</a></p>', options: { dialect: "gfm" } },
  { id: "gfm-strikethrough", source: "~~Hi~~ Hello, world!\n", expectedHtml: "<p><del>Hi</del> Hello, world!</p>", options: { dialect: "gfm" } },
  { id: "gfm-table", source: "| foo | bar |\n| --- | --- |\n| baz | bim |\n", expectedHtml: "<table><thead><tr><th>foo</th><th>bar</th></tr></thead><tbody><tr><td>baz</td><td>bim</td></tr></tbody></table>", options: { dialect: "gfm" } },
  { id: "gfm-table-align", source: "| abc | defghi |\n:-: | -----------:\nbar | baz\n", expectedHtml: '<table><thead><tr><th align="center">abc</th><th align="right">defghi</th></tr></thead><tbody><tr><td align="center">bar</td><td align="right">baz</td></tr></tbody></table>', options: { dialect: "gfm" } },
  { id: "gfm-task-list", source: "- [x] foo\n- [ ] bar\n", expectedHtml: '<ul class="contains-task-list"><li class="task-list-item"><input type="checkbox" disabled checked> foo</li><li class="task-list-item"><input type="checkbox" disabled> bar</li></ul>', options: { dialect: "gfm" } },
]);

export function runSecurityCorpus(document: MdfnDocument, policy?: RenderPolicy): ConformanceResult {
  const findings: ConformanceFinding[] = [];
  try {
    const result = renderHtml(document, policy);
    if (/<script\b|\son[a-z]+\s*=|javascript:/i.test(result.html)) {
      findings.push({ code: "MDFN_CONFORMANCE_UNSAFE_RENDER", fixture: "security", message: "Unsafe executable output was rendered" });
    }
  } catch (error) {
    findings.push({ code: "MDFN_CONFORMANCE_RENDER_EXCEPTION", fixture: "security", message: error instanceof Error ? error.message : String(error) });
  }
  return { ok: findings.length === 0, passed: findings.length === 0 ? 1 : 0, failed: findings.length, findings };
}

export interface SemanticTraceStep {
  readonly name: string;
  readonly state: MdfnJsonValue;
}

export interface AdapterSemanticTrace {
  readonly schemaVersion: 1;
  readonly framework: "vanilla" | "react" | "svelte" | "solid";
  readonly fixture: string;
  readonly steps: readonly SemanticTraceStep[];
  readonly finalMarkdown: string;
  readonly finalSelection: MdfnJsonValue;
  readonly diagnostics: readonly string[];
  readonly cleanup: { readonly subscriptions: number; readonly mounted: boolean };
}

export function traceState(framework: AdapterSemanticTrace["framework"], fixture: string, states: readonly EditorState[]): AdapterSemanticTrace {
  const final = states.at(-1);
  if (!final) throw new Error("MDFN_TRACE_STATE_MISSING");
  return {
    schemaVersion: 1,
    framework,
    fixture,
    steps: states.map((state) => ({ name: `version:${state.version}`, state: { markdown: state.markdown, dirty: state.dirty, selection: state.selection as MdfnJsonValue, diagnostics: state.diagnostics.map((entry) => entry.code) } })),
    finalMarkdown: final.markdown,
    finalSelection: final.selection as MdfnJsonValue,
    diagnostics: final.diagnostics.map((entry) => entry.code),
    cleanup: { subscriptions: 0, mounted: false },
  };
}

export function compareSemanticTraces(reference: AdapterSemanticTrace, traces: readonly AdapterSemanticTrace[]): ConformanceResult {
  const findings: ConformanceFinding[] = [];
  for (const trace of traces) {
    const comparable = (value: AdapterSemanticTrace) => JSON.stringify({ steps: value.steps, finalMarkdown: value.finalMarkdown, finalSelection: value.finalSelection, diagnostics: value.diagnostics, cleanup: value.cleanup });
    if (comparable(trace) !== comparable(reference)) findings.push({ code: "MDFN_ADAPTER_TRACE_DIVERGED", fixture: trace.fixture, message: `${trace.framework} diverged from vanilla semantics` });
  }
  return { ok: findings.length === 0, passed: traces.length - findings.length, failed: findings.length, findings };
}

export const representativeCorpus: readonly PreservationFixture[] = Object.freeze([
  { id: "commonmark", source: "# Heading\n\nParagraph with **bold** and *emphasis*.\n" },
  { id: "gfm-table", source: "| A | B |\n| - | - |\n| 1 | 2 |\n" },
  { id: "unicode-crlf", source: "# 日本語\r\n\r\nمرحبا 👋\r\n" },
  { id: "lone-cr", source: "# Heading\r\rParagraph.\r" },
  { id: "opaque-html", source: "<custom-element unsafe=\"no\">value</custom-element>\n" },
  { id: "malformed", source: "```ts\nconst value = 1;\n" },
]);

export function deterministicFuzzCorpus(seed = 0x4d44464e, cases = 100): readonly PreservationFixture[] {
  let value = seed >>> 0;
  const next = (): number => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value;
  };
  const tokens = ["plain", "**bold**", "_em_", "`code`", "[link](https://example.com)", "日本語", "👋", "<opaque-tag>", "\\*escaped", "~~strike~~"];
  return Array.from({ length: Math.max(0, cases) }, (_, index) => {
    const lines = Array.from({ length: 1 + (next() % 8) }, () => {
      const prefix = ["", "# ", "- ", "> ", "1. "][next() % 5];
      return `${prefix}${tokens[next() % tokens.length]} ${tokens[next() % tokens.length]}`;
    });
    const newline = next() % 3 === 0 ? "\r\n" : "\n";
    return { id: `fuzz-${seed}-${index}`, source: `${lines.join(newline)}${newline}` };
  });
}

export const MDFN_TESTING_VERSION = "0.1.0" as const;
