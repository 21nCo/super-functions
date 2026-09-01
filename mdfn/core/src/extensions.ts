import { hashValue } from "./hash";
import type { EditorCommand, ExtensionPlugin, ExtensionTextRule, MdfnDiagnostic, MdfnDocument, MdfnExtension } from "./types";

export class ExtensionGraphError extends Error {
  readonly code: string;
  readonly extension?: string;

  constructor(code: string, message: string, extension?: string) {
    super(message);
    this.name = "ExtensionGraphError";
    this.code = code;
    this.extension = extension;
  }
}

export interface ResolvedExtensionRegistry {
  readonly extensions: readonly MdfnExtension[];
  readonly schemaHash: string;
  readonly commands: Readonly<Record<string, EditorCommand>>;
  readonly keymap: Readonly<Record<string, string>>;
  readonly inputRules: readonly ExtensionTextRule[];
  readonly pasteRules: readonly ExtensionTextRule[];
  readonly plugins: readonly ExtensionPlugin[];
  diagnose(document: MdfnDocument): readonly MdfnDiagnostic[];
  migrate(document: MdfnDocument, fromVersion: number, toVersion: number): MdfnDocument;
}

export function applyExtensionTextRules(text: string, source: string, from: number, to: number, rules: readonly ExtensionTextRule[]): string {
  let output = text;
  for (const rule of rules) {
    const flags = rule.match.flags.replaceAll("g", "");
    const match = output.match(new RegExp(rule.match.source, flags));
    if (!match) continue;
    const replacement = rule.replace(match, { text: output, source, from, to });
    if (replacement !== null) output = replacement;
  }
  return output;
}

function assertName(value: string, label: string): void {
  if (!/^[a-z][a-z0-9-]*(?:\/[a-z][a-z0-9-]*)*$/.test(value)) {
    throw new ExtensionGraphError("MDFN_EXTENSION_NAME_INVALID", `${label} has invalid name: ${value}`, value);
  }
}

export function resolveExtensions(input: readonly MdfnExtension[]): ResolvedExtensionRegistry {
  const byName = new Map<string, MdfnExtension>();
  for (const extension of input) {
    assertName(extension.name, "Extension");
    if (byName.has(extension.name)) {
      throw new ExtensionGraphError("MDFN_EXTENSION_DUPLICATE", `Duplicate extension: ${extension.name}`, extension.name);
    }
    if (!extension.version.trim()) {
      throw new ExtensionGraphError("MDFN_EXTENSION_VERSION_INVALID", `Extension ${extension.name} requires a version`, extension.name);
    }
    if (extension.security?.executesContent) {
      throw new ExtensionGraphError(
        "MDFN_EXTENSION_EXECUTION_FORBIDDEN",
        `Extension ${extension.name} cannot execute content inside the portable profile`,
        extension.name,
      );
    }
    byName.set(extension.name, extension);
  }

  for (const extension of input) {
    for (const migration of extension.migrations ?? []) {
      if (!Number.isInteger(migration.from) || !Number.isInteger(migration.to) || migration.from < 1 || migration.to !== migration.from + 1) {
        throw new ExtensionGraphError(
          "MDFN_EXTENSION_MIGRATION_INVALID",
          `Extension ${extension.name} migrations must advance exactly one positive schema version`,
          extension.name,
        );
      }
    }
    for (const dependency of extension.dependencies ?? []) {
      if (!byName.has(dependency)) {
        throw new ExtensionGraphError(
          "MDFN_EXTENSION_DEPENDENCY_MISSING",
          `Extension ${extension.name} requires ${dependency}`,
          extension.name,
        );
      }
    }
    for (const conflict of extension.conflicts ?? []) {
      if (byName.has(conflict)) {
        throw new ExtensionGraphError(
          "MDFN_EXTENSION_CONFLICT",
          `Extension ${extension.name} conflicts with ${conflict}`,
          extension.name,
        );
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const ordered: MdfnExtension[] = [];
  const visit = (name: string, path: readonly string[]): void => {
    if (visited.has(name)) return;
    if (visiting.has(name)) {
      throw new ExtensionGraphError(
        "MDFN_EXTENSION_CYCLE",
        `Extension dependency cycle: ${[...path, name].join(" -> ")}`,
        name,
      );
    }
    visiting.add(name);
    const extension = byName.get(name)!;
    for (const dependency of extension.dependencies ?? []) visit(dependency, [...path, name]);
    visiting.delete(name);
    visited.add(name);
    ordered.push(extension);
  };

  for (const extension of [...input].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.name.localeCompare(b.name))) {
    visit(extension.name, []);
  }

  const commands: Record<string, EditorCommand> = {};
  for (const extension of ordered) {
    for (const [name, command] of Object.entries(extension.commands ?? {})) {
      const qualified = `${extension.name}:${name}`;
      if (commands[qualified]) {
        throw new ExtensionGraphError("MDFN_EXTENSION_COMMAND_DUPLICATE", `Duplicate command: ${qualified}`, extension.name);
      }
      commands[qualified] = command;
    }
  }

  const keymap: Record<string, string> = {};
  const inputRules: ExtensionTextRule[] = [];
  const pasteRules: ExtensionTextRule[] = [];
  const plugins: ExtensionPlugin[] = [];
  const pluginNames = new Set<string>();
  for (const extension of ordered) {
    for (const [key, command] of Object.entries(extension.keymap ?? {})) {
      if (keymap[key]) throw new ExtensionGraphError("MDFN_EXTENSION_KEYMAP_DUPLICATE", `Duplicate key binding ${key}: ${keymap[key]} and ${extension.name}:${command}`, extension.name);
      const qualified = command.includes(":") ? command : `${extension.name}:${command}`;
      if (!commands[qualified]) throw new ExtensionGraphError("MDFN_EXTENSION_KEYMAP_COMMAND_MISSING", `Key binding ${key} references missing command ${qualified}`, extension.name);
      keymap[key] = qualified;
    }
    for (const rule of extension.inputRules ?? []) {
      if (!(rule.match instanceof RegExp) || !rule.name.trim()) throw new ExtensionGraphError("MDFN_EXTENSION_INPUT_RULE_INVALID", `Extension ${extension.name} has an invalid input rule`, extension.name);
      inputRules.push(rule);
    }
    for (const rule of extension.pasteRules ?? []) {
      if (!(rule.match instanceof RegExp) || !rule.name.trim()) throw new ExtensionGraphError("MDFN_EXTENSION_PASTE_RULE_INVALID", `Extension ${extension.name} has an invalid paste rule`, extension.name);
      pasteRules.push(rule);
    }
    for (const plugin of extension.plugins ?? []) {
      const qualified = `${extension.name}:${plugin.name}`;
      if (pluginNames.has(qualified)) throw new ExtensionGraphError("MDFN_EXTENSION_PLUGIN_DUPLICATE", `Duplicate plugin ${qualified}`, extension.name);
      pluginNames.add(qualified);
      plugins.push(plugin);
    }
  }

  const schemaHash = hashValue(
    ordered.map((extension) => ({
      name: extension.name,
      version: extension.version,
      schema: extension.schema ?? null,
      preservation: extension.preservation,
      security: extension.security ?? null,
    })),
  );

  return {
    extensions: ordered,
    schemaHash,
    commands,
    keymap,
    inputRules,
    pasteRules,
    plugins,
    diagnose(document) {
      return ordered.flatMap((extension) => extension.diagnostics?.(document) ?? []);
    },
    migrate(document, fromVersion, toVersion) {
      if (fromVersion === toVersion) return document;
      if (fromVersion > toVersion) {
        throw new ExtensionGraphError("MDFN_SCHEMA_DOWNGRADE_FORBIDDEN", "Schema downgrades are not supported");
      }
      let current = document;
      let version = fromVersion;
      while (version < toVersion) {
        const migrations = ordered
          .flatMap((extension) => extension.migrations ?? [])
          .filter((migration) => migration.from === version && migration.to === version + 1);
        if (migrations.length === 0) {
          throw new ExtensionGraphError(
            "MDFN_SCHEMA_MIGRATION_MISSING",
            `No schema migration from version ${version} to ${toVersion}`,
          );
        }
        for (const migration of migrations) current = migration.migrate({ ...current, schemaVersion: version });
        version += 1;
        current = { ...current, schemaVersion: version };
      }
      return current;
    },
  };
}
