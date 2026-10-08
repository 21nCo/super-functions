import { createHash } from "node:crypto";

import { isCredentialKey, validateDevFnConfig, type DevFnConfig, type HealthCheck } from "@devfn/config";
import { createProcessEnvironment, resolveHttpReadinessUrl } from "@devfn/processes";
import { composeProjectName, createComposeEnvironment } from "@devfn/compose";

import { DevFnError, type LifecyclePlan } from "./types.js";

export interface EndpointResolutionInput {
  config: DevFnConfig;
  plan: LifecyclePlan;
  /** Opaque lifecycle owner. Callers may choose more than one owner per checkout. */
  ownerId: string;
  ports: Readonly<Record<string, number>>;
  /** Effective policy suffix for selected local proxy hostnames. */
  hostnameSuffix?: string;
  /** Effective Compose network names for each selected service. Required for sibling DNS wiring. */
  composeNetworks?: Readonly<Record<string, readonly string[]>>;
}

export interface ResolvedNodeStartup {
  environment: Record<string, string>;
  /** Non-secret host-side values for readiness commands executed outside Compose. */
  readinessEnvironment: Record<string, string>;
  /** Fully resolved direct HTTP probe, including path and query. */
  healthUrl?: string;
  command?: string[];
  script?: string;
  healthCommand?: string[];
}

export interface EndpointResolution {
  ownerId: string;
  /** Generated values take precedence over all manifest literals. */
  generated: Record<string, string>;
  /** Non-secret values suitable for owner-only environment outputs. */
  environment: Record<string, string>;
  /** Direct loopback URLs available before proxy route installation. */
  directUrls: Record<string, string>;
  /** URLs reachable by sibling services on the same Compose project network. */
  composeUrls: Record<string, string>;
  nodes: Record<string, ResolvedNodeStartup>;
}

const REFERENCE = /\{\{env\.([A-Za-z_]\w*)\}\}/g;
const SPECIAL_URL_SCHEMES = ["https:", "http:", "wss:", "ws:", "ftp:"] as const;
const MAX_TEMPLATE_VALUE_BYTES = 64 * 1024;
const MAX_TEMPLATE_AGGREGATE_BYTES = 2 * 1024 * 1024;

function invalid(field: string, message: string): never {
  throw new DevFnError("DEVFN_RUNTIME_INVALID", `${field}: ${message}`);
}

interface CheckedValues {
  values: Record<string, string>;
  checked: Record<string, string>;
}

function valueDependencies(key: string, value: string, values: Record<string, string>, resolved: Record<string, string>, generated: CheckedValues, field: string): Set<string> {
  const dependencies = new Set<string>();
  for (const match of value.matchAll(REFERENCE)) {
    const reference = match[1];
    if (reference === key && Object.hasOwn(generated.values, key)) continue;
    if (Object.hasOwn(values, reference)) dependencies.add(reference);
    else if (!Object.hasOwn(generated.values, reference) && !Object.hasOwn(resolved, reference)) invalid(field, `missing reference ${reference}.`);
  }
  return dependencies;
}

function resolutionGraph(values: Record<string, string>, resolved: CheckedValues, generated: CheckedValues, field: string): {
  dependents: Map<string, string[]>; outstanding: Map<string, number>;
} {
  const generatedKeys = new Map(Object.keys(generated.values).map((key) => [key.toUpperCase(), key]));
  const dependents = new Map<string, string[]>();
  const outstanding = new Map<string, number>();
  for (const key of Object.keys(values)) {
    const generatedKey = generatedKeys.get(key.toUpperCase());
    if (generatedKey && generatedKey !== key) invalid(`${field}.${key}`, `collides with generated environment key ${generatedKey}.`);
    if (!generatedKey) { delete resolved.values[key]; delete resolved.checked[key]; }
    const dependencies = valueDependencies(key, values[key], values, resolved.values, generated, field);
    outstanding.set(key, dependencies.size);
    for (const dependency of dependencies) {
      const consumers = dependents.get(dependency) ?? [];
      consumers.push(key);
      dependents.set(dependency, consumers);
    }
  }
  return { dependents, outstanding };
}

function resolveValues(values: Record<string, string>, base: CheckedValues, generated: CheckedValues, field: string, budget: { remaining: number }): CheckedValues {
  const resolved: CheckedValues = {
    values: Object.assign(Object.create(null), base.values),
    checked: Object.assign(Object.create(null), base.checked),
  };
  const { dependents, outstanding } = resolutionGraph(values, resolved, generated, field);
  const queue = [...outstanding].filter(([, count]) => count === 0).map(([key]) => key);
  let visited = 0;
  // Array iteration observes keys appended as their dependencies resolve.
  for (const key of queue) {
    const expanded = expand(values[key], `${field}.${key}`, (reference) => {
      if (Object.hasOwn(generated.values, reference)) return [generated.values[reference], generated.checked[reference]];
      if (Object.hasOwn(resolved.values, reference)) return [resolved.values[reference], resolved.checked[reference]];
      invalid(field, `missing reference ${reference}.`);
    }, budget);
    if (!Object.hasOwn(generated.values, key)) {
      resolved.values[key] = expanded[0];
      resolved.checked[key] = expanded[1];
    }
    visited += 1;
    for (const dependent of dependents.get(key) ?? []) {
      const remaining = outstanding.get(dependent)! - 1;
      outstanding.set(dependent, remaining);
      if (remaining === 0) queue.push(dependent);
    }
  }
  if (visited !== outstanding.size) {
    const participant = [...outstanding].find(([, count]) => count > 0)?.[0];
    invalid(field, `cyclic reference containing ${participant}.`);
  }
  return resolved;
}

function expand(value: string, field: string, lookup: (name: string) => [string, string], budget: { remaining: number }): [string, string] {
  if (value.length > MAX_TEMPLATE_VALUE_BYTES) invalid(field, "template value exceeds the preflight size limit.");
  // Parse the manifest source only. Referenced values (including opaque owners)
  // are data and must never be parsed as another template.
  const literal = value.replace(REFERENCE, "");
  // A closing pair is ordinary data in nested JSON. Only an unmatched opener
  // can be mistaken for a template reference.
  if (literal.includes("{{")) invalid(field, "malformed template reference.");
  // Manifest syntax is checked before substitution. The owner is opaque data:
  // its bytes may resemble a credential argument or URL without declaring one.
  rejectUrlCredentials(value, field);
  rejectCredentialArgument(value, field);
  const references = new Map<string, [string, string]>();
  const resolved = (key: string): [string, string] => {
    if (!references.has(key)) references.set(key, lookup(key));
    return references.get(key)!;
  };
  let expandedSize = value.length;
  let checkedSize = value.length;
  for (const match of value.matchAll(REFERENCE)) {
    const [replacement, checkedReplacement] = resolved(match[1]);
    expandedSize += replacement.length - match[0].length;
    checkedSize += checkedReplacement.length - match[0].length;
    if (expandedSize > MAX_TEMPLATE_VALUE_BYTES || checkedSize > MAX_TEMPLATE_VALUE_BYTES) {
      invalid(field, "expanded template value exceeds the preflight size limit.");
    }
  }
  budget.remaining -= Math.max(expandedSize, checkedSize);
  if (budget.remaining < 0) invalid(field, "aggregate expanded templates exceed the preflight size limit.");
  const expanded = value.replace(REFERENCE, (_match, key: string) => resolved(key)[0]);
  if (expanded.includes("\0")) invalid(field, "NUL is not a valid environment or argv value.");
  const checked = value.replace(REFERENCE, (_match, key: string) => resolved(key)[1]);
  rejectUrlCredentials(checked, field);
  rejectCredentialArgument(checked, field);
  return [expanded, checked];
}

function rejectCredentialArgument(value: string, field: string): void {
  // Percent encoding is data to the resolver, but many command-line clients
  // decode it before sending a header or URL. Inspect both representations.
  for (const checked of decodedVariants(value)) {
    rejectStructuredCredentialPayload(checked, field);
    for (const argument of checked.matchAll(/(?:^|\s)--([A-Za-z][A-Za-z0-9_-]*)(?==|\s|$)/g)) {
      // --cookie is a value-taking curl option. Its assignment names are
      // checked with the same credential grammar after argv is assembled.
      if (argument[1].toLowerCase() !== "cookie" && isCredentialKey(argument[1])) invalid(field, "credential-bearing argv must use the secret channel.");
    }
    // An option, header, object-like field or nested assignment can wrap a
    // credential declaration. A single cursor keeps malformed long operands
    // bounded, unlike a regex that retries a long whitespace suffix at each
    // character.
    scanEmbeddedCredentialNames(checked, field);
  }
  rejectCredentialVector([value], field);
}

interface EmbeddedScanState {
  inTag: boolean;
  tagQuote: string;
  jsonDepth: number;
  jsonQuote: string;
  jsonEscape: boolean;
}

function advanceEmbeddedJson(value: string, index: number, state: EmbeddedScanState): number | null {
  const char = value[index];
  // Structured field names are checked by rejectStructuredCredentialPayload.
  // JSON string content is data even when it resembles XML or an assignment.
  if (state.jsonQuote) {
    if (state.jsonEscape) state.jsonEscape = false;
    else if (char === "\\") state.jsonEscape = true;
    else if (char === state.jsonQuote) state.jsonQuote = "";
    return index + 1;
  }
  if (!state.inTag && state.jsonDepth > 0 && (char === '"' || char === "'")) {
    state.jsonQuote = char;
    return index + 1;
  }
  if (!state.inTag && (char === "{" || char === "[")) state.jsonDepth += 1;
  else if (!state.inTag && state.jsonDepth > 0 && (char === "}" || char === "]")) state.jsonDepth -= 1;
  return null;
}

/** Consume structural text that cannot declare an embedded assignment. */
function advanceEmbeddedContext(value: string, index: number, state: EmbeddedScanState): number | null {
  const jsonIndex = advanceEmbeddedJson(value, index, state);
  if (jsonIndex !== null) return jsonIndex;
  const char = value[index];
  if (value.startsWith("<!--", index)) {
    const close = value.indexOf("-->", index + 4);
    state.inTag = false;
    state.tagQuote = "";
    return close < 0 ? value.length : close + 3;
  }
  if (char === "<" && !state.tagQuote) { state.inTag = true; return index + 1; }
  if (state.inTag && (char === '"' || char === "'")) {
    if (!state.tagQuote) state.tagQuote = char;
    else if (state.tagQuote === char) state.tagQuote = "";
    return index + 1;
  }
  if (state.tagQuote) return index + 1;
  if (char === ">" && state.inTag) { state.inTag = false; return index + 1; }
  return null;
}

function scanEmbeddedName(value: string, start: number, field: string): number {
  let end = start;
  while (end < value.length && /[A-Za-z0-9_.-]/.test(value[end])) end += 1;
  let next = end;
  while (next < value.length && /\s/.test(value[next])) next += 1;
  if (isCredentialKey(value.slice(start, end)) && (value[next] === "=" || value[next] === "@" || value[next] === ":")) {
    invalid(field, "credential-bearing argv must use the secret channel.");
  }
  return end;
}

function scanEmbeddedCredentialNames(value: string, field: string): void {
  const state: EmbeddedScanState = { inTag: false, tagQuote: "", jsonDepth: 0, jsonQuote: "", jsonEscape: false };
  for (let index = 0; index < value.length;) {
    const nextIndex = advanceEmbeddedContext(value, index, state);
    if (nextIndex !== null) { index = nextIndex; continue; }
    if (!/[A-Za-z_]/.test(value[index])) { index += 1; continue; }
    if (index > 0 && /[A-Za-z0-9_.-]/.test(value[index - 1])) { index += 1; continue; }
    index = scanEmbeddedName(value, index, field);
  }
}

function readXmlTag(value: string, start: number): { tag: string; lastIndex: number } {
  let quote = "";
  const unquoted: string[] = [];
  for (let index = start; index < value.length; index += 1) {
    const char = value[index];
    if (quote) {
      if (char === quote) quote = "";
      unquoted.push(" ");
    } else if (char === '"' || char === "'") {
      quote = char;
      unquoted.push(" ");
    } else if (char === "<" && index !== start) {
      // A malformed tag must not hide the next one.
      return { tag: unquoted.join(""), lastIndex: index - 1 };
    } else {
      unquoted.push(char);
      if (char === ">") return { tag: unquoted.join(""), lastIndex: index };
    }
  }
  return { tag: unquoted.join(""), lastIndex: value.length };
}

function nextXmlAttribute(tag: string, start: number): { cursor: number; name?: string; assigned: boolean } {
  let cursor = start;
  if (!/\s/.test(tag[cursor])) return { cursor: cursor + 1, assigned: false };
  while (cursor < tag.length && /\s/.test(tag[cursor])) cursor += 1;
  if (!/[A-Za-z_]/.test(tag[cursor] ?? "")) return { cursor, assigned: false };
  const nameStart = cursor;
  while (cursor < tag.length && /[A-Za-z0-9_.:-]/.test(tag[cursor])) cursor += 1;
  const name = tag.slice(nameStart, cursor);
  while (cursor < tag.length && /\s/.test(tag[cursor])) cursor += 1;
  return { cursor, name, assigned: tag[cursor] === "=" };
}

function rejectXmlAttributes(tag: string, cursor: number, field: string): void {
  while (cursor < tag.length) {
    const attribute = nextXmlAttribute(tag, cursor);
    cursor = attribute.cursor;
    if (attribute.assigned && isCredentialKey(attribute.name!)) {
      invalid(field, "credential-bearing structured argv must use the secret channel.");
    }
  }
}

function rejectXmlTagNames(tag: string, field: string): void {
  let cursor = 1;
  while (cursor < tag.length && /\s|\//.test(tag[cursor])) cursor += 1;
  if (!/[A-Za-z_]/.test(tag[cursor] ?? "")) return;
  const elementStart = cursor;
  while (cursor < tag.length && /[A-Za-z0-9_.:-]/.test(tag[cursor])) cursor += 1;
  if (isCredentialKey(tag.slice(elementStart, cursor))) invalid(field, "credential-bearing structured argv must use the secret channel.");
  rejectXmlAttributes(tag, cursor, field);
}

/** Inspect XML names outside comments and quoted attribute values, including incomplete tags. */
function rejectXmlCredentialFields(value: string, field: string, jsonStrings: readonly [number, number][]): void {
  let stringIndex = 0;
  let index = 0;
  while (index < value.length) {
    if (value[index] !== "<") { index += 1; continue; }
    while (stringIndex < jsonStrings.length && jsonStrings[stringIndex][1] < index) stringIndex += 1;
    // A comment opener inside JSON data is not an XML comment. Skipping it
    // would hide any real element that follows the string.
    if (stringIndex < jsonStrings.length && jsonStrings[stringIndex][0] <= index) { index += 1; continue; }
    if (value.startsWith("<!--", index)) {
      const close = value.indexOf("-->", index + 4);
      index = close < 0 ? value.length : close + 3;
      continue;
    }
    const result = readXmlTag(value, index);
    rejectXmlTagNames(result.tag, field);
    index = result.lastIndex + 1;
  }
}

function rejectStructuredKey(raw: string, quote: string, field: string): void {
  let key = raw;
  if (quote === '"') {
    try { key = JSON.parse(`"${raw}"`) as string; } catch { /* inspect malformed keys too */ }
  }
  // JSON.parse handles valid escapes; malformed and shell-quoted bodies may
  // lose another escape layer at their eventual consumer.
  for (let depth = 0; depth < 3; depth += 1) {
    if (isCredentialKey(key)) invalid(field, "credential-bearing structured argv must use the secret channel.");
    const decoded = key.replace(/\\(?:u([0-9a-fA-F]{4})|x([0-9a-fA-F]{2})|(.))/g, (_match, unicode: string | undefined, hex: string | undefined, escaped: string | undefined) => {
      if (unicode) return String.fromCodePoint(Number.parseInt(unicode, 16));
      if (hex) return String.fromCodePoint(Number.parseInt(hex, 16));
      return escaped ?? "";
    });
    if (decoded === key) break;
    key = decoded;
  }
}

function rejectParsedJsonKeys(root: unknown, field: string): void {
  const pending: unknown[] = [root];
  while (pending.length) {
    const node = pending.pop();
    if (Array.isArray(node)) {
      for (const child of node) pending.push(child);
      continue;
    }
    if (node === null || typeof node !== "object") continue;
    for (const [key, child] of Object.entries(node)) {
      if (isCredentialKey(key)) invalid(field, "credential-bearing structured argv must use the secret channel.");
      pending.push(child);
    }
  }
}

function structuredCandidates(value: string): string[] {
  const candidates = [value];
  for (let depth = 0; depth < 2; depth += 1) {
    const unquoted = candidates.at(-1)!.replaceAll(String.raw`\"`, '"');
    if (unquoted === candidates.at(-1)) break;
    candidates.push(unquoted);
  }
  return candidates;
}

/** Return the next significant character without treating comments as data. */
function afterJsonTrivia(value: string, start: number): number {
  let index = start;
  while (index < value.length) {
    if (/\s/.test(value[index])) { index += 1; continue; }
    if (value.startsWith("/*", index)) {
      const close = value.indexOf("*/", index + 2);
      index = close < 0 ? value.length : close + 2;
      continue;
    }
    if (value.startsWith("//", index)) {
      const newline = value.indexOf("\n", index + 2);
      index = newline < 0 ? value.length : newline + 1;
      continue;
    }
    break;
  }
  return index;
}

function bareJsonKeyEnd(value: string, start: number, field: string): number {
  let end = start + 1;
  while (end < value.length && /[A-Za-z0-9_.-]/.test(value[end])) end += 1;
  if (value[afterJsonTrivia(value, end)] === ":") rejectStructuredKey(value.slice(start, end), "", field);
  return end;
}

interface StructuredScanState {
  stack: Array<{ delimiter: "{" | "["; expectsKey: boolean }>;
  jsonStrings: Array<[number, number]>;
  start: number;
  stringStart: number;
  quote: string;
  escaped: boolean;
  pendingKey?: { raw: string; quote: string };
}

function scanStructuredQuote(value: string, index: number, state: StructuredScanState, field: string): void {
  const char = value[index];
  if (state.escaped) { state.escaped = false; return; }
  if (char === "\\") { state.escaped = true; return; }
  if (char !== state.quote) return;
  const closedQuote = state.quote;
  state.quote = "";
  if (state.stack.length) state.jsonStrings.push([state.stringStart, index]);
  if (state.stack.at(-1)?.delimiter !== "{") return;
  const raw = value.slice(state.stringStart + 1, index);
  if (state.stack.at(-1)!.expectsKey) rejectStructuredKey(raw, closedQuote, field);
  else state.pendingKey = { raw, quote: closedQuote };
}

function scanStructuredDelimiter(value: string, index: number, state: StructuredScanState, field: string): void {
  const char = value[index];
  if (char === "{" || char === "[") { state.stack.push({ delimiter: char, expectsKey: char === "{" }); return; }
  if (char === ":" && state.stack.at(-1)?.delimiter === "{") { state.stack.at(-1)!.expectsKey = false; return; }
  if (char === "," && state.stack.at(-1)?.delimiter === "{") { state.stack.at(-1)!.expectsKey = true; return; }
  if (char !== "}" && char !== "]") return;
  if (state.stack.pop()?.delimiter !== (char === "}" ? "{" : "[")) { state.stack.length = 0; state.quote = ""; return; }
  if (state.stack.length > 0) return;
  try { rejectParsedJsonKeys(JSON.parse(value.slice(state.start, index + 1)) as unknown, field); }
  catch (error) { if (error instanceof DevFnError) throw error; }
}

function scanStructuredAt(value: string, index: number, state: StructuredScanState, field: string): number {
  const char = value[index];
  if (state.stack.length === 0) {
    if (char !== "{" && char !== "[") return index;
    state.start = index;
  }
  if (state.quote) { scanStructuredQuote(value, index, state, field); return index; }
  const afterTrivia = afterJsonTrivia(value, index);
  if (afterTrivia > index) return afterTrivia - 1;
  if (state.pendingKey) {
    if (char === ":") rejectStructuredKey(state.pendingKey.raw, state.pendingKey.quote, field);
    state.pendingKey = undefined;
  }
  if (state.stack.at(-1)?.delimiter === "{" && /[A-Za-z_]/.test(char)) {
    return bareJsonKeyEnd(value, index, field) - 1;
  }
  if (char === '"' || char === "'") { state.quote = char; state.stringStart = index; return index; }
  scanStructuredDelimiter(value, index, state, field);
  return index;
}

function scanStructuredCandidate(value: string, field: string): Array<[number, number]> {
  const state: StructuredScanState = { stack: [], jsonStrings: [], start: -1, stringStart: -1, quote: "", escaped: false };
  for (let index = 0; index < value.length;) index = scanStructuredAt(value, index, state, field) + 1;
  return state.jsonStrings;
}

/** Inspect JSON bodies as data, including JSON escapes in field names. */
function rejectStructuredCredentialPayload(value: string, field: string): void {
  // A script or --data-raw= argument may contain a JSON body after other
  // text. Include shell-quoted JSON in package scripts without executing it.
  for (const candidate of structuredCandidates(value)) {
    const jsonStrings = scanStructuredCandidate(candidate, field);
    // An XML-shaped JSON string is data; an actual XML attribute is a field.
    rejectXmlCredentialFields(candidate, field, jsonStrings);
  }
}

function decodedVariants(value: string): string[] {
  const variants = [value];
  for (let depth = 0; depth < 2; depth += 1) {
    try {
      const decoded = decodeURIComponent(variants.at(-1)!);
      if (decoded === variants.at(-1)) break;
      variants.push(decoded);
    } catch { break; }
  }
  return variants;
}

const CURL_OTHER_SHORT_VALUE_OPTIONS = new Set("E K C c D P h m o x Q r e X Y y t z T A w".split(" "));

/** Curl permits no-value switches before a value-taking short option. */
function curlShortValueOption(token: string): { option: string; attached: string } | undefined {
  if (!token.startsWith("-") || token.startsWith("--")) return undefined;
  // Stop at an earlier option that consumes the rest of the token. Other
  // short switches (including -g, -4 and -6) can prefix a sensitive option.
  for (let index = 1; index < token.length; index += 1) {
    const option = token[index];
    if (option === "H" || option === "u" || option === "U" || option === "d" || option === "F" || option === "b") {
      return { option, attached: token.slice(index + 1).replace(/^=/, "") };
    }
    if (CURL_OTHER_SHORT_VALUE_OPTIONS.has(option)) return { option, attached: token.slice(index + 1).replace(/^=/, "") };
  }
  return undefined;
}

function rejectCredentialCookies(raw: string, field: string): void {
  for (const candidate of decodedVariants(raw.replace(/["'`]/g, ""))) {
    for (const cookie of candidate.split(/[;&]/)) {
      const assignment = /^([^=\s]+)=/.exec(cookie.trim());
      if (assignment && isCredentialKey(assignment[1])) invalid(field, "credential-bearing cookie must use the secret channel.");
    }
  }
}

/** Hide JSON string data from option/assignment token inspection; structured keys are checked separately. */
function maskJsonStrings(value: string): string {
  const chars = [...value];
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index];
    if (quote) {
      chars[index] = " ";
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (depth > 0 && (char === '"' || char === "'")) { quote = char; chars[index] = " "; continue; }
    if (char === "{" || char === "[") depth += 1;
    else if (depth > 0 && (char === "}" || char === "]")) depth -= 1;
  }
  return chars.join("");
}

function trimArgumentQuotes(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && (value[start] === '"' || value[start] === "'" || value[start] === "`")) start += 1;
  while (end > start && (value[end - 1] === '"' || value[end - 1] === "'" || value[end - 1] === "`")) end -= 1;
  return value.slice(start, end);
}

type ShortValueOption = ReturnType<typeof curlShortValueOption>;

function rejectAssignmentOptions(token: string, next: string | undefined, short: ShortValueOption, field: string): void {
  // Bare assignments, forwarding options, and attached short options all
  // reach persisted argv, so they share the same credential-key grammar.
  const bare = /^([A-Za-z_][A-Za-z0-9_.-]*)(?:=|:=)/.exec(token);
  if (bare && isCredentialKey(bare[1])) invalid(field, "credential-bearing argv must use the secret channel.");
  rejectLongAssignmentOption(token, field);
  rejectForwardedAssignmentOption(token, next, field);
  if (short) rejectShortAssignmentOption(short, next, field);
}

function rejectLongAssignmentOption(token: string, field: string): void {
  const longValue = /^--[A-Za-z][A-Za-z0-9_-]*=(.*)$/.exec(token)?.[1];
  if (longValue !== undefined) {
    const value = trimArgumentQuotes(longValue);
    const assignment = /^([A-Za-z_][A-Za-z0-9_.-]*)(?:=|:=|@|$)/.exec(value);
    if (assignment && isCredentialKey(assignment[1]) &&
        (/^--(?:env|build-arg)=/i.test(token) || /(?:=|:=|@)/.test(value.slice(assignment[1].length)))) {
      invalid(field, "credential-bearing argv must use the secret channel.");
    }
  }
}

function rejectForwardedAssignmentOption(token: string, next: string | undefined, field: string): void {
  if (!/^--(?:env|build-arg)$/i.test(token) || next === undefined) return;
  const assignment = /^([A-Za-z_][A-Za-z0-9_.-]*)(?:=|:=|@|$)/.exec(trimArgumentQuotes(next));
  if (assignment && isCredentialKey(assignment[1])) invalid(field, "credential-bearing argv must use the secret channel.");
}

function rejectShortAssignmentOption(short: NonNullable<ShortValueOption>, next: string | undefined, field: string): void {
  const raw = short.attached || next;
  if (raw === undefined) return;
  for (const candidate of decodedVariants(raw.replace(/^["']|["']$/g, ""))) {
    const assignment = /^([A-Za-z_][A-Za-z0-9_.-]*)(?:=|:=|@)/.exec(candidate);
    if (assignment && isCredentialKey(assignment[1])) invalid(field, "credential-bearing argv must use the secret channel.");
  }
}

function rejectCertificateOption(token: string, next: string | undefined, short: ShortValueOption, field: string): void {
  const option = /^--cert(?:=(.*))?$/i.exec(token);
  if (!option && short?.option !== "E") return;
  const raw = option ? option[1] ?? next : short!.attached || next;
  if (raw === undefined) return;
  for (const candidate of decodedVariants(raw.replace(/^["']|["']$/g, ""))) {
    // Curl's certificate:password form is a credential; a Windows drive
    // prefix is a path separator and must remain ordinary data.
    const pathOrPair = /^[A-Za-z]:[\\/]/.test(candidate) ? candidate.slice(2) : candidate;
    if (pathOrPair.includes(":")) invalid(field, "credential-bearing argv must use the secret channel.");
  }
}

function rejectHeaderOption(token: string, next: string | undefined, short: ShortValueOption, field: string): void {
  const option = /^--(?:proxy-)?header(?:=(.*))?$/i.exec(token);
  if (!option && short?.option !== "H") return;
  const raw = option ? option[1] ?? next : short!.attached || next;
  if (raw === undefined) return;
  const name = /^([A-Za-z][A-Za-z0-9_-]*)\s*:/.exec(raw.replace(/["'`]/g, "").trimStart())?.[1];
  if (name && isCredentialKey(name)) invalid(field, "credential-bearing header must use the secret channel.");
}

function rejectUserOption(token: string, next: string | undefined, short: ShortValueOption, field: string): void {
  const option = /^(--(?:proxy-)?user(?:name)?|-u|-U)(?:=(.*))?$/i.exec(token);
  if (!option && short?.option !== "u" && short?.option !== "U") return;
  const raw = option ? option[2] ?? next : short!.attached || next;
  if (raw === undefined) return;
  for (const candidate of decodedVariants(raw.replace(/^["']|["']$/g, ""))) {
    if (candidate.includes(":")) invalid(field, "credential-bearing argv must use the secret channel.");
  }
}

function rejectFormOption(token: string, next: string | undefined, short: ShortValueOption, field: string): void {
  const option = /^(--(?:data(?:-ascii|-binary|-raw|-urlencode)?|form(?:-string)?|url-query)|-[dF])(?:=(.*))?$/i.exec(token);
  if (!option && short?.option !== "d" && short?.option !== "F") return;
  const raw = option ? option[2] ?? next : short!.attached || next;
  if (raw === undefined) return;
  for (const candidate of decodedVariants(raw.replace(/^["']|["']$/g, "").replace(/^\+/, ""))) {
    const assignment = /^([^=:@\s]+)(?:=|:=|@)/.exec(candidate);
    if (assignment && isCredentialKey(assignment[1])) invalid(field, "credential-bearing argv must use the secret channel.");
  }
}

function rejectCookieOption(token: string, tokens: readonly string[], index: number, nextOption: readonly number[], short: ShortValueOption, field: string): void {
  const option = /^--cookie(?:=(.*))?$/i.exec(token);
  if (!option && short?.option !== "b") return;
  // Quoted cookie lists may have been split for inspection at spaces.
  const raw = [option ? option[1] ?? "" : short!.attached,
    ...tokens.slice(index + 1, nextOption[index + 1])].join(" ");
  if (raw) rejectCredentialCookies(raw, field);
}

/** Check options that become credential-bearing only with their value. */
function rejectCredentialVector(values: readonly string[], field: string): void {
  // Package scripts are one string; native commands and health probes are
  // vectors. Split only for inspection, never for execution or argv output.
  const variants = values.map(decodedVariants);
  for (let depth = 0; depth <= 2; depth += 1) {
    const tokens = variants.flatMap((items) => maskJsonStrings(items[depth] ?? items.at(-1)!).match(/\S+/g) ?? []);
    // Find each cookie operand boundary once to avoid suffix copying at
    // every ordinary --cookie option.
    const nextOption = new Array<number>(tokens.length + 1);
    nextOption[tokens.length] = tokens.length;
    for (let index = tokens.length - 1; index >= 0; index -= 1) {
      nextOption[index] = /^--?[A-Za-z]/.test(tokens[index]) ? index : nextOption[index + 1];
    }
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index].replace(/^["']|["']$/g, "");
      const next = tokens[index + 1];
      const short = curlShortValueOption(token);
      rejectAssignmentOptions(token, next, short, field);
      rejectCertificateOption(token, next, short, field);
      rejectHeaderOption(token, next, short, field);
      rejectUserOption(token, next, short, field);
      rejectFormOption(token, next, short, field);
      rejectCookieOption(token, tokens, index, nextOption, short, field);
    }
  }
}

function decodedJsonString(value: string, start: number, end: number): string | undefined {
  try {
    const decoded = JSON.parse(value.slice(start, end + 1)) as unknown;
    return typeof decoded === "string" ? decoded : undefined;
  } catch { return undefined; }
}

function decodedJsonStrings(value: string): string[] {
  const strings: string[] = [];
  let start = -1;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (start < 0) {
      if (char === '"') start = index;
      continue;
    }
    if (escaped) { escaped = false; continue; }
    if (char === "\\") { escaped = true; continue; }
    if (char !== '"') continue;
    const decoded = decodedJsonString(value, start, index);
    if (decoded !== undefined) strings.push(decoded);
    start = -1;
  }
  return strings;
}

function rejectUrlCredentials(value: string, field: string): void {
  // Plain JSON and argv text without URL delimiters cannot acquire an
  // authority through the supported decoding layers.
  if (!/[/?#&%\\]/.test(value) && !/(?:https?|wss?|ftp):/i.test(value)) return;
  // Commands and environment literals can contain JSON rather than a URL
  // directly. JSON escapes (including \\/ and \\u002f) are decoded by the
  // eventual consumer, so inspect each decoded string as a value. Limit the
  // number of decoding layers and scan each layer once to keep preflight
  // bounded even for malformed or very long input.
  let layer = [value];
  for (let depth = 0; depth < 3 && layer.length; depth += 1) {
    const next: string[] = [];
    for (const item of layer) {
      for (const checked of decodedVariants(item)) rejectUrlCredentialsDecoded(checked, field);
      if (depth < 2) next.push(...decodedJsonStrings(item));
    }
    layer = next;
  }
}

function specialSchemeLength(lower: string, index: number): number {
  for (const scheme of SPECIAL_URL_SCHEMES) {
    if (lower.startsWith(scheme, index)) return scheme.length;
  }
  return 0;
}

function rejectUrlQueryCredentials(value: string, field: string): void {
  for (const match of value.matchAll(/[?&#]([^=?#&]+)=([^&#]*)/g)) {
    const key = new URLSearchParams(`${match[1]}=x`).keys().next().value ?? match[1];
    if (isCredentialKey(key)) invalid(field, "credential-bearing URL must use the secret channel.");
  }
}

function rejectSchemeRelativeUserinfo(value: string, field: string): void {
  // Any // can start a scheme-relative authority, including in a query,
  // bracketed value, or after punctuation. Inspect the authority itself,
  // rather than guessing which preceding separator permits a URL. A single
  // cursor avoids reparsing malformed long authorities.
  let index = 0;
  while (index + 1 < value.length) {
    if (value[index] !== "/" || value[index + 1] !== "/") { index += 1; continue; }
    let end = index + 2;
    while (end < value.length && !/[\s\\/?#&]/.test(value[end])) {
      if (value[end] === "@") invalid(field, "credential-bearing URL must use the secret channel.");
      end += 1;
    }
    index = end;
  }
}

function scanSpecialSchemeAuthority(value: string, lower: string, start: number, field: string): number {
  let index = start;
  while (value[index] === "/" || value[index] === "\\") index += 1;
  while (index < value.length && !/[\s\\/?#<>"'`{}|]/.test(value[index])) {
    if (value[index] === "@") invalid(field, "credential-bearing URL must use the secret channel.");
    if (specialSchemeLength(lower, index)) return index;
    index += 1;
  }
  return index + 1;
}

function rejectSpecialSchemeUserinfo(value: string, lower: string, field: string): void {
  // WHATWG normalizes special-scheme URLs with no `//`, and treats a
  // backslash before the authority as a slash. Inspect that authority too:
  // the `//` scan above intentionally does not reinterpret UNC paths.
  let index = 0;
  while (index < value.length) {
    const schemeLength = specialSchemeLength(lower, index);
    if (!schemeLength) { index += 1; continue; }
    // Returning at a nested scheme leaves its prefix for the outer cursor.
    index = scanSpecialSchemeAuthority(value, lower, index + schemeLength, field);
  }
}

function pathAssignmentBoundary(char: string, state: { inUrl: boolean; inPath: boolean }): boolean {
  if (/[\s<>"'`{}|]/.test(char)) { state.inUrl = false; state.inPath = false; return false; }
  if (!state.inUrl) return false;
  if (char === "?" || char === "#" || char === "&") { state.inPath = false; return false; }
  if (char === "/" || char === "\\") state.inPath = true;
  return state.inPath && (char === "/" || char === ";" || char === "\\");
}

function rejectPathAssignment(value: string, index: number, field: string): void {
  let end = index + 1;
  if (!/[A-Za-z_]/.test(value[end] ?? "")) return;
  while (end < value.length && /[A-Za-z0-9_.-]/.test(value[end])) end += 1;
  if (value[end] === "=" && isCredentialKey(value.slice(index + 1, end))) {
    invalid(field, "credential-bearing URL must use the secret channel.");
  }
}

function rejectUrlPathCredentials(value: string, lower: string, field: string): void {
  // A URL path can carry credential-named assignments as matrix parameters
  // or segments. Recognize URL context first so ordinary shell assignments
  // remain argv data. Each path segment is visited at most once.
  const state = { inUrl: false, inPath: false };
  for (let index = 0; index < value.length; index += 1) {
    const schemeLength = specialSchemeLength(lower, index);
    if (schemeLength) { state.inUrl = true; state.inPath = false; index += schemeLength - 1; continue; }
    if (value[index] === "/" && value[index + 1] === "/") { state.inUrl = true; state.inPath = false; index += 1; continue; }
    if (pathAssignmentBoundary(value[index], state)) rejectPathAssignment(value, index, field);
  }
}

function rejectUrlCredentialsDecoded(source: string, field: string): void {
  // WHATWG URL parsing removes ASCII tab, LF and CR anywhere in a URL. Check
  // that effective representation before an HTTP readiness origin is replaced:
  // the replacement would otherwise erase userinfo from the configured URL.
  const value = source.replace(/[\t\n\r]/g, "");
  const lower = value.toLowerCase();
  rejectUrlQueryCredentials(value, field);
  rejectSchemeRelativeUserinfo(value, field);
  rejectSpecialSchemeUserinfo(value, lower, field);
  rejectUrlPathCredentials(value, lower, field);
}

function normalized(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

export function resolveLocalHostname(configured: string | undefined, key: string, projectId: string, ownerId: string, suffix = ".localhost"): string {
  const template = (configured ?? `${key}-{instance}${suffix}`).replaceAll("{project}", projectId);
  const ownerLabel = template.split(".").find((label) => label.includes("{instance}"));
  const budget = ownerLabel ? 63 - ownerLabel.replaceAll("{instance}", "").length : 63;
  if (budget < 22) invalid(`hostnames.${key}`, "hostname has no room for an opaque owner component.");
  const safeOwner = `o-${createHash("sha256").update(ownerId).digest("hex").slice(0, 20)}`;
  const result = template.includes("{instance}") ? template.replaceAll("{instance}", safeOwner) :
    template.replace(/\.localhost$/i, `.${safeOwner}.localhost`);
  if (result.length > 253) invalid(`hostnames.${key}`, "local hostname exceeds the DNS length limit.");
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+localhost$/i.test(result)) invalid(`hostnames.${key}`, `local hostname ${result} must be a concrete .localhost name.`);
  return result;
}

interface NodeResolutionContext {
  input: EndpointResolutionInput;
  config: DevFnConfig;
  generated: Record<string, string>;
  checkedGenerated: CheckedValues;
  environment: CheckedValues;
  directUrls: Record<string, string>;
  composeUrls: Record<string, string>;
  healthUrls: ReadonlyMap<string, string>;
  budget: { remaining: number };
}

function serviceGeneratedValues(node: LifecyclePlan["nodes"][number], context: NodeResolutionContext, field: string): CheckedValues {
  const { input, config, directUrls, composeUrls, checkedGenerated } = context;
  const generated: CheckedValues = { values: { ...context.generated }, checked: { ...checkedGenerated.checked } };
  if (node.kind !== "service") return generated;
  const unreachable = new Set<string>();
  for (const producer of input.plan.nodes) {
    const producerPorts = producer.kind === "service" ? config.services![producer.name].ports ?? {} :
      Object.fromEntries((config.processes![producer.name].ports ?? []).map((port) => [port, true]));
    for (const port of Object.keys(producerPorts)) {
      const key = `DEVFN_URL_${normalized(port)}`;
      if (!Object.hasOwn(directUrls, port)) continue;
      if (composeSiblingReachable(producer, node, context)) {
        generated.values[key] = composeUrls[port];
        generated.checked[key] = composeUrls[port];
      } else { delete generated.values[key]; delete generated.checked[key]; unreachable.add(key); }
    }
  }
  rejectUnreachableReferences(node, context, field, unreachable);
  return generated;
}

function composeSiblingReachable(producer: LifecyclePlan["nodes"][number], consumer: LifecyclePlan["nodes"][number], context: NodeResolutionContext): boolean {
  if (producer.kind !== "service" || consumer.kind !== "service") return false;
  const { input, config } = context;
  const producerProject = composeProjectName(config.services![producer.name].projectName ?? "devfn", input.ownerId);
  const consumerProject = composeProjectName(config.services![consumer.name].projectName ?? "devfn", input.ownerId);
  if (producerProject !== consumerProject) return false;
  const producerNetworks = input.composeNetworks?.[producer.name] ?? [];
  const consumerNetworks = input.composeNetworks?.[consumer.name] ?? [];
  return producerNetworks.some((name) => consumerNetworks.includes(name));
}

function rejectUnreachableReferences(node: LifecyclePlan["nodes"][number], context: NodeResolutionContext, field: string, unreachable: ReadonlySet<string>): void {
  const { input, config } = context;
  const profile = config.profiles[input.plan.profile];
  const spec = config.services![node.name];
  for (const value of [...Object.values(profile.environment ?? {}), ...Object.values(spec.env ?? {})]) {
    for (const match of value.matchAll(REFERENCE)) if (unreachable.has(match[1])) {
      invalid(field, producerIsNative(input.plan, config, match[1]) ?
        `reference ${match[1]} points to a native loopback process unreachable from Compose.` :
        `reference ${match[1]} has no shared effective Compose network.`);
    }
  }
}

function expandedArgv(item: string, location: string, lookup: (key: string) => [string, string], budget: { remaining: number }): [string, string] {
  const pair = expand(item, location, lookup, budget);
  if (!pair[0].length) invalid(location, "argv value cannot be empty.");
  return pair;
}

function resolvedCommandParts(processSpec: NonNullable<DevFnConfig["processes"]>[string] | undefined,
  health: HealthCheck | undefined, nodeEnvironment: CheckedValues, readinessEnvironment: CheckedValues,
  field: string, budget: { remaining: number }): Pick<ResolvedNodeStartup, "command" | "script" | "healthCommand"> {
  const lookup = (values: CheckedValues) => (key: string): [string, string] => {
    if (!Object.hasOwn(values.values, key)) invalid(field, `missing reference ${key}.`);
    return [values.values[key], values.checked[key]];
  };
  const commandPairs = processSpec?.command?.map((item, index) => expandedArgv(item, `${field}.command[${index}]`, lookup(nodeEnvironment), budget));
  if (commandPairs) rejectCredentialVector(commandPairs.map((pair) => pair[1]), `${field}.command`);
  const scriptPair = processSpec?.script !== undefined ? expandedArgv(processSpec.script, `${field}.script`, lookup(nodeEnvironment), budget) : undefined;
  if (scriptPair) rejectCredentialVector([scriptPair[1]], `${field}.script`);
  const healthPairs = health?.type === "command" ? health.command.map((item, index) =>
    expandedArgv(item, `${field}.health.command[${index}]`, lookup(readinessEnvironment), budget)) : undefined;
  if (healthPairs) rejectCredentialVector(healthPairs.map((pair) => pair[1]), `${field}.health.command`);
  return {
    ...(commandPairs ? { command: commandPairs.map((pair) => pair[0]) } : {}),
    ...(scriptPair ? { script: scriptPair[0] } : {}),
    ...(healthPairs ? { healthCommand: healthPairs.map((pair) => pair[0]) } : {}),
  };
}

function assertNodeEnvironmentCasing(spec: { env?: Record<string, string> }, profile: { environment?: Record<string, string> }, field: string): void {
  const profileKeys = new Map(Object.keys(profile.environment ?? {}).map((key) => [key.toUpperCase(), key]));
  for (const key of Object.keys(spec.env ?? {})) {
    const profileKey = profileKeys.get(key.toUpperCase());
    if (profileKey && profileKey !== key) invalid(`${field}.env.${key}`, `collides with profile environment key ${profileKey}.`);
  }
}

function resolveNodeStartup(node: LifecyclePlan["nodes"][number], context: NodeResolutionContext): ResolvedNodeStartup {
  const { input, config, checkedGenerated, environment, healthUrls, budget } = context;
  const spec = node.kind === "process" ? config.processes?.[node.name] : config.services?.[node.name];
  if (!spec) invalid(`nodes.${node.name}`, "selected node is missing.");
  const field = `${node.kind === "process" ? "processes" : "services"}.${node.name}`;
  const profile = config.profiles[input.plan.profile];
  assertNodeEnvironmentCasing(spec, profile, field);
  const processSpec = node.kind === "process" ? config.processes![node.name] : undefined;
  const nativeBind: Record<string, string> = processSpec && processSpec.exposure !== "public" ? { HOST: "127.0.0.1", DEVFN_HOST: "127.0.0.1" } : {};
  const nodeGenerated = serviceGeneratedValues(node, context, field);
  const profileEnvironment = node.kind === "service" ? resolveValues(profile.environment ?? {}, nodeGenerated, nodeGenerated, `profiles.${input.plan.profile}.environment`, budget) : environment;
  const nodeEnvironment = resolveValues(spec.env ?? {},
    { values: { ...profileEnvironment.values, ...nativeBind }, checked: { ...profileEnvironment.checked, ...nativeBind } },
    { values: { ...nodeGenerated.values, ...nativeBind }, checked: { ...nodeGenerated.checked, ...nativeBind } }, `${field}.env`, budget);
  const readinessEnvironment = node.kind === "service" ?
    resolveValues(spec.env ?? {}, environment, checkedGenerated, `${field}.env`, budget) : nodeEnvironment;
  const commands = resolvedCommandParts(processSpec, spec.health, nodeEnvironment, readinessEnvironment, field, budget);
  try {
    if (processSpec) createProcessEnvironment({ ...processSpec, env: nodeEnvironment.values });
    else createComposeEnvironment({ ...config.services![node.name], env: nodeEnvironment.values });
  } catch (error) { invalid(field, error instanceof Error ? error.message : "environment keys collide after case folding."); }
  return { environment: nodeEnvironment.values, readinessEnvironment: readinessEnvironment.values,
    ...(healthUrls.has(node.name) ? { healthUrl: healthUrls.get(node.name) } : {}), ...commands };
}

function selectedProxyHostnames(input: EndpointResolutionInput, config: DevFnConfig, httpPorts: Set<string>): Set<string> {
  const hostnames = new Set<string>();
  if (!input.plan.proxy) return hostnames;
  for (const [name, hostname] of Object.entries(config.hostnames ?? {})) {
    if (hostname.profiles && !hostname.profiles.includes(input.plan.profile)) continue;
    hostnames.add(resolveLocalHostname(hostname.hostname, name, config.project.id, input.ownerId, input.hostnameSuffix).toLowerCase());
    if (hostname.hostname && !hostname.hostname.includes("{instance}")) {
      hostnames.add(hostname.hostname.replaceAll("{project}", config.project.id).toLowerCase());
    }
    httpPorts.add(hostname.target);
  }
  return hostnames;
}

function leasedDirectHealthUrl(health: Extract<HealthCheck, { type: "http" }>, url: URL, input: EndpointResolutionInput,
  selectedRouteHostnames: ReadonlySet<string>, httpPorts: Set<string>, httpSchemes: Map<string, string>): void {
  if (!health.port) return;
  if (health.url && selectedRouteHostnames.has(new URL(health.url).hostname.toLowerCase().replace(/\.$/, ""))) {
    url.protocol = "http:";
    // URL drops an explicit default HTTPS port before the scheme changes.
    url.port = String(input.ports[health.port]);
  }
  httpPorts.add(health.port);
  httpSchemes.set(health.port, url.protocol.slice(0, -1));
}

function directHealthUrl(node: LifecyclePlan["nodes"][number], input: EndpointResolutionInput, config: DevFnConfig,
  selectedRouteHostnames: ReadonlySet<string>, httpPorts: Set<string>, httpSchemes: Map<string, string>): string | undefined {
  const health = node.kind === "process" ? config.processes?.[node.name]?.health : config.services?.[node.name]?.health;
  if (health?.type !== "http") return undefined;
  const field = `${node.kind === "process" ? "processes" : "services"}.${node.name}.health`;
  if (health.url) rejectUrlCredentials(health.url, `${field}.url`);
  if (health.path) rejectUrlCredentials(health.path, `${field}.path`);
  let url: URL;
  try { url = new URL(resolveHttpReadinessUrl(health, input.ports)); }
  catch { invalid(field, "invalid direct HTTP readiness URL."); }
  rejectUrlCredentials(url.toString(), field);
  const selectedProxyHost = selectedRouteHostnames.has(url.hostname.toLowerCase().replace(/\.$/, ""));
  if (!health.port && selectedProxyHost) invalid(field, "URL-only readiness cannot wait for a selected proxy route before installation; use its leased port.");
  leasedDirectHealthUrl(health, url, input, selectedRouteHostnames, httpPorts, httpSchemes);
  return url.toString();
}

function composeInternalUrl(input: EndpointResolutionInput, config: DevFnConfig, name: string, scheme: string): string | undefined {
  let url: string | undefined;
  for (const node of input.plan.nodes) {
    if (node.kind !== "service" || !input.composeNetworks?.[node.name]?.length) continue;
    const service = config.services?.[node.name];
    const internal = service?.ports?.[name];
    if (internal !== undefined) url = `${scheme}://${service!.service}:${internal}`;
  }
  return url;
}

function generatedPortValues(input: EndpointResolutionInput, config: DevFnConfig, generated: Record<string, string>,
  httpPorts: ReadonlySet<string>, httpSchemes: ReadonlyMap<string, string>): { directUrls: Record<string, string>; composeUrls: Record<string, string> } {
  const directUrls: Record<string, string> = Object.create(null);
  const composeUrls: Record<string, string> = Object.create(null);
  for (const name of input.plan.portNames) {
    const port = input.ports[name];
    if (!Number.isInteger(port) || port < 1 || port > 65535) invalid(`ports.${name}`, "requires a leased port between 1 and 65535.");
    generated[`DEVFN_PORT_${normalized(name)}`] = String(port);
    const alias = config.ports?.[name]?.env;
    if (alias) generated[alias] = String(port);
    if (!httpPorts.has(name) || config.ports?.[name]?.protocol === "udp") continue;
    const scheme = httpSchemes.get(name) ?? "http";
    const url = `${scheme}://127.0.0.1:${port}`;
    directUrls[name] = url;
    generated[`DEVFN_URL_${normalized(name)}`] = url;
    const internalUrl = composeInternalUrl(input, config, name, scheme);
    if (internalUrl) composeUrls[name] = internalUrl;
  }
  return { directUrls, composeUrls };
}

/** Resolve one selected profile before launch; no process, lease, or filesystem mutation occurs here. */
export function resolveEndpointTemplates(input: EndpointResolutionInput): EndpointResolution {
  const budget = { remaining: MAX_TEMPLATE_AGGREGATE_BYTES };
  const { plan, ownerId } = input;
  const config = validateDevFnConfig(input.config);
  if (!ownerId || ownerId.includes("\0")) invalid("ownerId", "must be a non-empty opaque value without NUL.");
  const profile = config.profiles[plan.profile];
  if (!profile) invalid("profile", `unknown profile ${plan.profile}.`);
  const generated: Record<string, string> = {
    DEVFN_PROJECT_ID: config.project.id,
    DEVFN_INSTANCE_ID: ownerId,
    DEVFN_PROFILE: plan.profile,
  };
  const httpPorts = new Set<string>();
  const httpSchemes = new Map<string, string>();
  const healthUrls = new Map<string, string>();
  const selectedRouteHostnames = selectedProxyHostnames(input, config, httpPorts);
  for (const node of plan.nodes) {
    const url = directHealthUrl(node, input, config, selectedRouteHostnames, httpPorts, httpSchemes);
    if (url) healthUrls.set(node.name, url);
  }
  const { directUrls, composeUrls } = generatedPortValues(input, config, generated, httpPorts, httpSchemes);
  const checkedGenerated: CheckedValues = { values: generated, checked: { ...generated, DEVFN_INSTANCE_ID: "devfnopaqueowner" } };
  const environment = resolveValues(profile.environment ?? {}, checkedGenerated, checkedGenerated, `profiles.${plan.profile}.environment`, budget);
  const nodes: Record<string, ResolvedNodeStartup> = Object.create(null);
  const context: NodeResolutionContext = { input, config, generated, checkedGenerated, environment, directUrls, composeUrls, healthUrls, budget };
  for (const node of plan.nodes) nodes[node.name] = resolveNodeStartup(node, context);
  return { ownerId, generated, environment: environment.values, directUrls, composeUrls, nodes };
}

function producerIsNative(plan: LifecyclePlan, config: DevFnConfig, key: string): boolean {
  return plan.nodes.some((node) => node.kind === "process" &&
    (config.processes?.[node.name]?.ports ?? []).some((port) => `DEVFN_URL_${normalized(port)}` === key));
}
