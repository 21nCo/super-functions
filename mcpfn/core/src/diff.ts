import type {
  McpFnContractChange,
  McpFnDiffResult,
  McpFnJsonSchema,
  McpFnManifest,
  McpFnManifestPrompt,
  McpFnManifestResource,
  McpFnManifestResourceTemplate,
  McpFnManifestTool,
} from "./types.js";
import { canonicalJson, compareCodeUnits } from "./canonical.js";

type Direction = "input" | "output";
type SchemaNode = McpFnJsonSchema | boolean;

function push(
  changes: McpFnContractChange[],
  change: McpFnContractChange,
): void {
  changes.push(change);
}

function valueSet(value: unknown): Set<string> | undefined {
  return Array.isArray(value)
    ? new Set(value.map((entry) => canonicalJson(entry)))
    : undefined;
}

function equal(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function schemaTypes(schema: McpFnJsonSchema): Set<string> | undefined {
  if (Array.isArray(schema.type)) {
    return new Set(schema.type.filter((value): value is string => typeof value === "string"));
  }
  return typeof schema.type === "string" ? new Set([schema.type]) : undefined;
}

function equalSets(left: Set<string>, right: Set<string>): boolean {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function matchingPatternSchemas(
  schema: McpFnJsonSchema,
  propertyName: string,
): SchemaNode[] {
  const patterns = schema.patternProperties;
  if (!patterns || typeof patterns !== "object" || Array.isArray(patterns)) {
    return [];
  }
  return Object.entries(patterns)
    .filter(([pattern]) => {
      try {
        return new RegExp(pattern).test(propertyName);
      } catch {
        return false;
      }
    })
    .map(([, patternSchema]) => patternSchema as SchemaNode);
}

function diffSchema(
  before: SchemaNode | undefined,
  after: SchemaNode | undefined,
  path: string,
  direction: Direction,
  changes: McpFnContractChange[],
): void {
  if (before && typeof before === "object" && !Object.keys(before).length) before = true;
  if (after && typeof after === "object" && !Object.keys(after).length) after = true;
  if (before === undefined && after !== undefined) {
    push(changes, {
      severity: direction === "input" ? "breaking" : "additive",
      code: "schema-added",
      path,
      message: `Schema added at ${path}`,
      after,
    });
    return;
  }
  if (before !== undefined && after === undefined) {
    push(changes, {
      severity: direction === "input" ? "additive" : "breaking",
      code: "schema-removed",
      path,
      message: `Schema removed at ${path}`,
      before,
    });
    return;
  }
  if (before === undefined || after === undefined || equal(before, after)) return;
  if (typeof before === "boolean" || typeof after === "boolean") {
    const tightened = before === true || after === false;
    const relaxed = before === false || after === true;
    const breaking = direction === "input" ? tightened : relaxed;
    push(changes, {
      severity: breaking ? "breaking" : "additive",
      code: "boolean-schema-changed",
      path,
      message: `Boolean schema changed at ${path}`,
      before,
      after,
    });
    return;
  }

  const beforeTypes = schemaTypes(before);
  const afterTypes = schemaTypes(after);
  if (
    !equal(before.type, after.type) &&
    !(beforeTypes && afterTypes && equalSets(beforeTypes, afterTypes))
  ) {
    const removed = beforeTypes && afterTypes
      ? [...beforeTypes].filter((value) => !afterTypes?.has(value))
      : [];
    const added = beforeTypes && afterTypes
      ? [...afterTypes].filter((value) => !beforeTypes?.has(value))
      : [];
    const tightened = beforeTypes === undefined
      ? afterTypes !== undefined
      : afterTypes !== undefined && removed.length > 0;
    const relaxed = afterTypes === undefined || added.length > 0;
    const breaking = direction === "input" ? tightened : relaxed;
    push(changes, {
      severity: breaking ? "breaking" : "additive",
      code: "schema-type-changed",
      path,
      message: `Type changed from ${canonicalJson(before.type ?? "unspecified")} to ${canonicalJson(after.type ?? "unspecified")}`,
      before: before.type,
      after: after.type,
    });
  }

  const beforeEnum = valueSet(before.enum);
  const afterEnum = valueSet(after.enum);
  if (!beforeEnum && afterEnum) {
    push(changes, {
      severity: direction === "input" ? "breaking" : "additive",
      code: "enum-introduced",
      path,
      message: `An enum constraint was introduced at ${path}`,
      after: after.enum,
    });
  } else if (beforeEnum && !afterEnum) {
    push(changes, {
      severity: direction === "input" ? "additive" : "breaking",
      code: "enum-removed",
      path,
      message: `The enum constraint was removed at ${path}`,
      before: before.enum,
    });
  } else if (beforeEnum && afterEnum) {
    const removed = [...beforeEnum].filter((entry) => !afterEnum.has(entry));
    const added = [...afterEnum].filter((entry) => !beforeEnum.has(entry));
    if (removed.length) {
      push(changes, {
        severity: direction === "input" ? "breaking" : "additive",
        code: "enum-narrowed",
        path,
        message: `Allowed values were removed at ${path}`,
        before: before.enum,
        after: after.enum,
      });
    }
    if (added.length) {
      push(changes, {
        severity: direction === "input" ? "additive" : "breaking",
        code: "enum-widened",
        path,
        message: `Allowed values were added at ${path}`,
        before: before.enum,
        after: after.enum,
      });
    }
  }

  const tightening: Array<[string, "higher" | "lower"]> = [
    ["minimum", "higher"],
    ["exclusiveMinimum", "higher"],
    ["minLength", "higher"],
    ["minItems", "higher"],
    ["maximum", "lower"],
    ["exclusiveMaximum", "lower"],
    ["maxLength", "lower"],
    ["maxItems", "lower"],
    ["minProperties", "higher"],
    ["maxProperties", "lower"],
  ];
  for (const [keyword, tightDirection] of tightening) {
    const oldValue = before[keyword];
    const newValue = after[keyword];
    if (equal(oldValue, newValue)) {
      continue;
    }
    if (
      oldValue !== undefined && typeof oldValue !== "number" ||
      newValue !== undefined && typeof newValue !== "number"
    ) {
      push(changes, {
        severity: "breaking",
        code: "schema-keyword-changed",
        path: `${path}.${keyword}`,
        message: `${keyword} changed at ${path}`,
        before: oldValue,
        after: newValue,
      });
      continue;
    }
    const tightened = oldValue === undefined
      ? true
      : newValue === undefined
        ? false
        : tightDirection === "higher"
          ? newValue > oldValue
          : newValue < oldValue;
    const breaking = direction === "input" ? tightened : !tightened;
    push(changes, {
      severity: breaking ? "breaking" : "additive",
      code: tightened ? "constraint-tightened" : "constraint-relaxed",
      path: `${path}.${keyword}`,
      message: `${keyword} changed from ${oldValue ?? "unspecified"} to ${newValue ?? "unspecified"}`,
      before: oldValue,
      after: newValue,
    });
  }

  for (const keyword of ["pattern", "format", "const"] as const) {
    const oldValue = before[keyword];
    const newValue = after[keyword];
    if (equal(oldValue, newValue)) continue;
    const tightened = oldValue === undefined && newValue !== undefined;
    const relaxed = oldValue !== undefined && newValue === undefined;
    push(changes, {
      severity:
        tightened || relaxed
          ? (direction === "input" ? tightened : relaxed) ? "breaking" : "additive"
          : "breaking",
      code: tightened ? "constraint-tightened" : relaxed ? "constraint-relaxed" : "schema-keyword-changed",
      path: `${path}.${keyword}`,
      message: `${keyword} changed at ${path}`,
      before: oldValue,
      after: newValue,
    });
  }

  const beforeUniqueItems = before.uniqueItems ?? false;
  const afterUniqueItems = after.uniqueItems ?? false;
  if (!equal(beforeUniqueItems, afterUniqueItems)) {
    if (typeof beforeUniqueItems !== "boolean" || typeof afterUniqueItems !== "boolean") {
      push(changes, {
        severity: "breaking",
        code: "schema-keyword-changed",
        path: `${path}.uniqueItems`,
        message: `uniqueItems changed at ${path}`,
        before: before.uniqueItems,
        after: after.uniqueItems,
      });
    } else {
      const tightened = !beforeUniqueItems && afterUniqueItems;
      const breaking = direction === "input" ? tightened : !tightened;
      push(changes, {
        severity: breaking ? "breaking" : "additive",
        code: tightened ? "constraint-tightened" : "constraint-relaxed",
        path: `${path}.uniqueItems`,
        message: `uniqueItems changed from ${beforeUniqueItems} to ${afterUniqueItems}`,
        before: before.uniqueItems,
        after: after.uniqueItems,
      });
    }
  }

  const normalizeAdditionalProperties = (value: unknown) =>
    value && typeof value === "object" && !Array.isArray(value) && !Object.keys(value).length
      ? true
      : value;
  const beforeAdditional = normalizeAdditionalProperties(before.additionalProperties ?? true);
  const afterAdditional = normalizeAdditionalProperties(after.additionalProperties ?? true);
  if (beforeAdditional !== false && afterAdditional === false) {
    push(changes, {
      severity: direction === "input" ? "breaking" : "additive",
      code: "additional-properties-disabled",
      path,
      message: `Additional properties are no longer accepted at ${path}`,
    });
  } else if (beforeAdditional === false && afterAdditional !== false) {
    push(changes, {
      severity: direction === "input" ? "additive" : "breaking",
      code: "additional-properties-enabled",
      path,
      message: `Additional properties are now accepted at ${path}`,
    });
  } else if (!equal(beforeAdditional, afterAdditional)) {
    diffSchema(
      beforeAdditional as SchemaNode,
      afterAdditional as SchemaNode,
      `${path}.additionalProperties`,
      direction,
      changes,
    );
  }

  const beforeProperties = (before.properties ?? {}) as Record<string, SchemaNode>;
  const afterProperties = (after.properties ?? {}) as Record<string, SchemaNode>;
  const propertyNames = [...new Set([
    ...Object.keys(beforeProperties),
    ...Object.keys(afterProperties),
    ...(Array.isArray(before.required) ? before.required as string[] : []),
    ...(Array.isArray(after.required) ? after.required as string[] : []),
  ])].sort();
  const beforeRequired = new Set(
    Array.isArray(before.required) ? (before.required as string[]) : [],
  );
  const afterRequired = new Set(
    Array.isArray(after.required) ? (after.required as string[]) : [],
  );

  for (const name of propertyNames) {
    const propertyPath = `${path}.properties.${name}`;
    const oldProperty = beforeProperties[name];
    const newProperty = afterProperties[name];
    const hadOldProperty = Object.prototype.hasOwnProperty.call(beforeProperties, name);
    const hasNewProperty = Object.prototype.hasOwnProperty.call(afterProperties, name);
    if (!hadOldProperty && hasNewProperty) {
      const newlyRequired = afterRequired.has(name);
      const additionalPropertyChanges: McpFnContractChange[] = [];
      if (
        direction === "output" &&
        typeof beforeAdditional === "object"
      ) {
        diffSchema(
          beforeAdditional as McpFnJsonSchema,
          newProperty,
          `${propertyPath}.additionalProperties`,
          "output",
          additionalPropertyChanges,
        );
      }
      const inputFallbackChanges: McpFnContractChange[] = [];
      if (direction === "input") {
        const patternSchemas = matchingPatternSchemas(before, name);
        const fallbackSchemas = patternSchemas.length
          ? patternSchemas
          : [beforeAdditional as SchemaNode];
        fallbackSchemas.forEach((fallbackSchema, index) => diffSchema(
          fallbackSchema,
          newProperty,
          `${propertyPath}.${patternSchemas.length ? `patternProperties.${index}` : "additionalProperties"}`,
          "input",
          inputFallbackChanges,
        ));
      }
      const breaksDeclaredOutput =
        direction === "output" &&
        (
          beforeAdditional === false ||
          additionalPropertyChanges.some((change) => change.severity === "breaking")
        );
      const narrowsAcceptedInput =
        direction === "input" &&
        inputFallbackChanges.some((change) => change.severity === "breaking");
      push(changes, {
        severity:
          direction === "input" && (newlyRequired || narrowsAcceptedInput) || breaksDeclaredOutput
            ? "breaking"
            : "additive",
        code:
          direction === "input" && newlyRequired
            ? "required-input-added"
            : breaksDeclaredOutput
              ? "output-property-added"
            : "property-added",
        path: propertyPath,
        message: `${newlyRequired ? "Required" : "Optional"} property ${name} was added`,
        after: newProperty,
      });
      continue;
    }
    if (hadOldProperty && !hasNewProperty) {
      const fallbackChanges: McpFnContractChange[] = [];
      const patternSchemas = matchingPatternSchemas(after, name);
      if (direction === "input") {
        const fallbackSchemas = patternSchemas.length
          ? patternSchemas
          : [afterAdditional as SchemaNode];
        fallbackSchemas.forEach((fallbackSchema, index) => diffSchema(
          oldProperty,
          fallbackSchema,
          `${propertyPath}.${patternSchemas.length ? `patternProperties.${index}` : "additionalProperties"}`,
          "input",
          fallbackChanges,
        ));
      }
      const breaking =
        direction === "output" && beforeRequired.has(name) ||
        fallbackChanges.some((change) => change.severity === "breaking");
      push(changes, {
        severity: breaking ? "breaking" : "additive",
        code: "property-removed",
        path: propertyPath,
        message: `Property ${name} was removed`,
        before: oldProperty,
      });
      continue;
    }
    diffSchema(oldProperty, newProperty, propertyPath, direction, changes);

    const wasRequired = beforeRequired.has(name);
    const isRequired = afterRequired.has(name);
    if (wasRequired === isRequired) continue;
    const breaking =
      direction === "input" ? !wasRequired && isRequired : wasRequired && !isRequired;
    push(changes, {
      severity: breaking ? "breaking" : "additive",
      code: breaking ? "requiredness-broken" : "requiredness-compatible",
      path: propertyPath,
      message: `Property ${name} changed from ${wasRequired ? "required" : "optional"} to ${isRequired ? "required" : "optional"}`,
    });
  }

  if (before.items !== undefined || after.items !== undefined) {
    diffSchema(
      before.items as SchemaNode | undefined,
      after.items as SchemaNode | undefined,
      `${path}.items`,
      direction,
      changes,
    );
  }

  const beforePatterns = (before.patternProperties ?? {}) as Record<string, SchemaNode>;
  const afterPatterns = (after.patternProperties ?? {}) as Record<string, SchemaNode>;
  const patternNames = [...new Set([
    ...Object.keys(beforePatterns),
    ...Object.keys(afterPatterns),
  ])].sort();
  for (const pattern of patternNames) {
    const hadBeforePattern = Object.prototype.hasOwnProperty.call(beforePatterns, pattern);
    const hasAfterPattern = Object.prototype.hasOwnProperty.call(afterPatterns, pattern);
    diffSchema(
      hadBeforePattern ? beforePatterns[pattern] : beforeAdditional as SchemaNode,
      hasAfterPattern ? afterPatterns[pattern] : afterAdditional as SchemaNode,
      `${path}.patternProperties.${pattern}`,
      direction,
      changes,
    );
    const overlapsExistingInputPattern =
      direction === "input" && !hadBeforePattern && hasAfterPattern &&
      Object.keys(beforePatterns).length > 0;
    const weakensExistingOutputPattern =
      direction === "output" && hadBeforePattern && !hasAfterPattern &&
      Object.keys(afterPatterns).length > 0;
    if (overlapsExistingInputPattern || weakensExistingOutputPattern) {
      push(changes, {
        severity: "breaking",
        code: "overlapping-pattern-constraint-changed",
        path: `${path}.patternProperties.${pattern}`,
        message: `${hadBeforePattern ? "Removing" : "Adding"} pattern ${pattern} can change constraints for properties matched by another pattern`,
        before: hadBeforePattern ? beforePatterns[pattern] : undefined,
        after: hasAfterPattern ? afterPatterns[pattern] : undefined,
      });
    }
  }

  const handledKeywords = new Set([
    "type", "enum", "properties", "required", "items", "additionalProperties",
    "patternProperties", "pattern", "format", "const", "uniqueItems",
    ...tightening.map(([keyword]) => keyword),
  ]);
  const behavioralKeywords = new Set([
    "$comment", "$id", "$schema", "default", "deprecated", "description",
    "examples", "readOnly", "title", "writeOnly",
  ]);
  const keywords = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  for (const keyword of keywords) {
    if (handledKeywords.has(keyword) || equal(before[keyword], after[keyword])) continue;
    const behavioral = behavioralKeywords.has(keyword) || /^x-/i.test(keyword);
    push(changes, {
      severity: behavioral ? "behavioral" : "breaking",
      code: behavioral ? "schema-guidance-changed" : "schema-keyword-changed",
      path: `${path}.${keyword}`,
      message: `${keyword} changed at ${path}`,
      before: before[keyword],
      after: after[keyword],
    });
  }
}

function diffTool(
  before: McpFnManifestTool,
  after: McpFnManifestTool,
  changes: McpFnContractChange[],
): void {
  const root = `tools.${before.name}`;
  if (before.title !== after.title) {
    push(changes, {
      severity: "behavioral",
      code: "tool-title-changed",
      path: `${root}.title`,
      message: `Tool title changed for ${before.name}`,
      before: before.title,
      after: after.title,
    });
  }
  if (before.description !== after.description) {
    push(changes, {
      severity: "behavioral",
      code: "tool-description-changed",
      path: `${root}.description`,
      message: `Tool description changed for ${before.name}`,
      before: before.description,
      after: after.description,
    });
  }
  if (!equal(before.annotations ?? {}, after.annotations ?? {})) {
    push(changes, {
      severity: "behavioral",
      code: "tool-annotations-changed",
      path: `${root}.annotations`,
      message: `Tool annotations changed for ${before.name}`,
      before: before.annotations,
      after: after.annotations,
    });
  }
  if (!equal(before.execution ?? {}, after.execution ?? {})) {
    const oldSupport = before.execution?.taskSupport ?? "forbidden";
    const newSupport = after.execution?.taskSupport ?? "forbidden";
    const breaking =
      newSupport === "required" ||
      (oldSupport !== "forbidden" && newSupport === "forbidden");
    push(changes, {
      severity: breaking ? "breaking" : "additive",
      code: "tool-task-support-changed",
      path: `${root}.execution.taskSupport`,
      message: `Tool task support changed from ${oldSupport} to ${newSupport}`,
      before: oldSupport,
      after: newSupport,
    });
  }
  if (!equal(before.icons ?? [], after.icons ?? [])) {
    push(changes, {
      severity: "behavioral",
      code: "tool-icons-changed",
      path: `${root}.icons`,
      message: `Tool icons changed for ${before.name}`,
      before: before.icons,
      after: after.icons,
    });
  }
  if (!equal(before.metadata ?? {}, after.metadata ?? {})) {
    push(changes, {
      severity: "behavioral",
      code: "tool-metadata-changed",
      path: `${root}.metadata`,
      message: `Tool metadata changed for ${before.name}`,
      before: before.metadata,
      after: after.metadata,
    });
  }
  diffSchema(before.inputSchema, after.inputSchema, `${root}.inputSchema`, "input", changes);
  diffSchema(before.outputSchema, after.outputSchema, `${root}.outputSchema`, "output", changes);
}

function diffResource(
  before: McpFnManifestResource,
  after: McpFnManifestResource,
  changes: McpFnContractChange[],
): void {
  const root = `resources.${before.uri}`;
  if ((before.subscribable ?? false) !== (after.subscribable ?? false)) {
    const enabled = after.subscribable === true;
    push(changes, {
      severity: enabled ? "additive" : "breaking",
      code: enabled ? "resource-subscription-enabled" : "resource-subscription-removed",
      path: `${root}.subscribable`,
      message: `Resource subscription support was ${enabled ? "enabled" : "removed"} for ${before.uri}`,
      before: before.subscribable,
      after: after.subscribable,
    });
  }
  if (before.mimeType !== after.mimeType) {
    push(changes, {
      severity: "breaking",
      code: "resource-mime-type-changed",
      path: `${root}.mimeType`,
      message: `Resource MIME type changed for ${before.uri}`,
      before: before.mimeType,
      after: after.mimeType,
    });
  }
  for (const key of ["name", "title", "description", "annotations", "icons", "metadata"] as const) {
    if (!equal(before[key], after[key])) {
      push(changes, {
        severity: "behavioral",
        code: `resource-${key}-changed`,
        path: `${root}.${key}`,
        message: `Resource ${key} changed for ${before.uri}`,
        before: before[key],
        after: after[key],
      });
    }
  }
}

function diffResourceTemplate(
  before: McpFnManifestResourceTemplate,
  after: McpFnManifestResourceTemplate,
  changes: McpFnContractChange[],
): void {
  const root = `resourceTemplates.${before.name}`;
  if ((before.subscribable ?? false) !== (after.subscribable ?? false)) {
    const enabled = after.subscribable === true;
    push(changes, {
      severity: enabled ? "additive" : "breaking",
      code: enabled
        ? "resource-template-subscription-enabled"
        : "resource-template-subscription-removed",
      path: `${root}.subscribable`,
      message: `Resource template subscription support was ${enabled ? "enabled" : "removed"} for ${before.name}`,
      before: before.subscribable,
      after: after.subscribable,
    });
  }
  if (before.uriTemplate !== after.uriTemplate) {
    push(changes, {
      severity: "breaking",
      code: "resource-template-uri-changed",
      path: `${root}.uriTemplate`,
      message: `Resource template URI changed for ${before.name}`,
      before: before.uriTemplate,
      after: after.uriTemplate,
    });
  }
  if (before.mimeType !== after.mimeType) {
    push(changes, {
      severity: "breaking",
      code: "resource-template-mime-type-changed",
      path: `${root}.mimeType`,
      message: `Resource template MIME type changed for ${before.name}`,
      before: before.mimeType,
      after: after.mimeType,
    });
  }
  for (const key of ["title", "description", "annotations", "icons", "metadata"] as const) {
    if (!equal(before[key], after[key])) {
      push(changes, {
        severity: "behavioral",
        code: `resource-template-${key}-changed`,
        path: `${root}.${key}`,
        message: `Resource template ${key} changed for ${before.name}`,
        before: before[key],
        after: after[key],
      });
    }
  }
}

function promptArgumentSchema(prompt: McpFnManifestPrompt): McpFnJsonSchema {
  if (prompt.argumentsSchema) return prompt.argumentsSchema;
  return {
    type: "object",
    properties: Object.fromEntries(
      (prompt.arguments ?? []).map((argument) => [argument.name, { type: "string" }]),
    ),
    required: (prompt.arguments ?? []).filter((argument) => argument.required).map((argument) => argument.name),
    additionalProperties: false,
  };
}

function diffPrompt(
  before: McpFnManifestPrompt,
  after: McpFnManifestPrompt,
  changes: McpFnContractChange[],
): void {
  const root = `prompts.${before.name}`;
  for (const key of ["title", "description", "icons", "metadata"] as const) {
    if (!equal(before[key], after[key])) {
      push(changes, {
        severity: "behavioral",
        code: `prompt-${key}-changed`,
        path: `${root}.${key}`,
        message: `Prompt ${key} changed for ${before.name}`,
        before: before[key],
        after: after[key],
      });
    }
  }
  diffSchema(
    promptArgumentSchema(before),
    promptArgumentSchema(after),
    `${root}.arguments`,
    "input",
    changes,
  );
  if (!equal(before.arguments ?? [], after.arguments ?? [])) {
    push(changes, {
      severity: "behavioral",
      code: "prompt-arguments-changed",
      path: `${root}.argumentsMetadata`,
      message: `Prompt argument metadata changed for ${before.name}`,
      before: before.arguments,
      after: after.arguments,
    });
  }
}

function requirementValues(value: unknown): Set<string> {
  if (value === true) return new Set(["true"]);
  if (Array.isArray(value)) return new Set(value.map((entry) => canonicalJson(entry)));
  return new Set();
}

function extensionRequired(value: unknown): boolean {
  return Boolean(value && typeof value === "object" &&
    !Array.isArray(value) && (value as { required?: unknown }).required === true);
}

function diffCollection<T>(
  label: string,
  before: T[],
  after: T[],
  key: (value: T) => string,
  compare: (before: T, after: T, changes: McpFnContractChange[]) => void,
  changes: McpFnContractChange[],
): void {
  const beforeValues = new Map(before.map((value) => [key(value), value]));
  const afterValues = new Map(after.map((value) => [key(value), value]));
  for (const name of [...beforeValues.keys()].sort()) {
    const next = afterValues.get(name);
    if (!next) {
      push(changes, {
        severity: "breaking",
        code: `${label}-removed`,
        path: `${label}.${name}`,
        message: `${label} ${name} was removed`,
        before: beforeValues.get(name),
      });
    } else compare(beforeValues.get(name)!, next, changes);
  }
  for (const name of [...afterValues.keys()].sort()) {
    if (!beforeValues.has(name)) {
      push(changes, {
        severity: "additive",
        code: `${label}-added`,
        path: `${label}.${name}`,
        message: `${label} ${name} was added`,
        after: afterValues.get(name),
      });
    }
  }
}

export function diffManifests(
  before: McpFnManifest,
  after: McpFnManifest,
): McpFnDiffResult {
  const changes: McpFnContractChange[] = [];
  if (before.server.name !== after.server.name) {
    push(changes, {
      severity: "breaking",
      code: "server-name-changed",
      path: "server.name",
      message: `Server name changed from ${before.server.name} to ${after.server.name}`,
      before: before.server.name,
      after: after.server.name,
    });
  }
  if (before.server.instructions !== after.server.instructions) {
    push(changes, {
      severity: "behavioral",
      code: "server-instructions-changed",
      path: "server.instructions",
      message: "Server instructions changed",
      before: before.server.instructions,
      after: after.server.instructions,
    });
  }
  const beforeTools = new Map(before.tools.map((tool) => [tool.name, tool]));
  const afterTools = new Map(after.tools.map((tool) => [tool.name, tool]));

  for (const name of [...beforeTools.keys()].sort()) {
    const oldTool = beforeTools.get(name)!;
    const newTool = afterTools.get(name);
    if (!newTool) {
      push(changes, {
        severity: "breaking",
        code: "tool-removed",
        path: `tools.${name}`,
        message: `Tool ${name} was removed`,
        before: oldTool,
      });
    } else {
      diffTool(oldTool, newTool, changes);
    }
  }
  for (const name of [...afterTools.keys()].sort()) {
    if (!beforeTools.has(name)) {
      push(changes, {
        severity: "additive",
        code: "tool-added",
        path: `tools.${name}`,
        message: `Tool ${name} was added`,
        after: afterTools.get(name),
      });
    }
  }

  diffCollection(
    "resources",
    before.resources ?? [],
    after.resources ?? [],
    (resource) => resource.uri,
    diffResource,
    changes,
  );
  diffCollection(
    "resourceTemplates",
    before.resourceTemplates ?? [],
    after.resourceTemplates ?? [],
    (resource) => resource.name,
    diffResourceTemplate,
    changes,
  );
  diffCollection(
    "prompts",
    before.prompts ?? [],
    after.prompts ?? [],
    (prompt) => prompt.name,
    diffPrompt,
    changes,
  );

  for (const key of ["capabilities", "clientRequirements", "extensions"] as const) {
    const oldRecord = (before[key] ?? {}) as Record<string, unknown>;
    const newRecord = (after[key] ?? {}) as Record<string, unknown>;
    for (const name of [...new Set([...Object.keys(oldRecord), ...Object.keys(newRecord)])].sort()) {
      if (equal(oldRecord[name], newRecord[name])) continue;
      const removed = oldRecord[name] !== undefined && newRecord[name] === undefined;
      const added = oldRecord[name] === undefined && newRecord[name] !== undefined;
      const requirementChanged = key === "clientRequirements";
      const oldRequiredValues = requirementValues(oldRecord[name]);
      const newRequiredValues = requirementValues(newRecord[name]);
      const requirementAdded = [...newRequiredValues]
        .some((value) => !oldRequiredValues.has(value));
      const requirementRemoved = [...oldRequiredValues]
        .some((value) => !newRequiredValues.has(value));
      if (requirementChanged && !requirementAdded && !requirementRemoved) continue;
      const extensionWasRequired = key === "extensions" && extensionRequired(oldRecord[name]);
      const extensionIsRequired = key === "extensions" && extensionRequired(newRecord[name]);
      push(changes, {
        severity: requirementChanged && requirementAdded
          ? "breaking"
          : requirementChanged && requirementRemoved
            ? "additive"
            : key === "extensions" && !extensionWasRequired && extensionIsRequired
              ? "breaking"
              : key === "extensions" && extensionWasRequired && !extensionIsRequired
                ? "additive"
            : removed
              ? "breaking"
              : added
                ? "additive"
                : "behavioral",
        code: `${key}-${removed ? "removed" : added ? "added" : "changed"}`,
        path: `${key}.${name}`,
        message: `${key} ${name} was ${removed ? "removed" : added ? "added" : "changed"}`,
        before: oldRecord[name],
        after: newRecord[name],
      });
    }
  }

  for (const key of ["protocolVersions", "transports"] as const) {
    const oldValues = new Set(before[key] ?? []);
    const newValues = new Set(after[key] ?? []);
    for (const value of [...oldValues].sort()) {
      if (!newValues.has(value as never)) {
        push(changes, {
          severity: "breaking",
          code: `${key}-support-removed`,
          path: key,
          message: `${key} support removed: ${value}`,
          before: value,
        });
      }
    }
    for (const value of [...newValues].sort()) {
      if (!oldValues.has(value as never)) {
        push(changes, {
          severity: "additive",
          code: `${key}-support-added`,
          path: key,
          message: `${key} support added: ${value}`,
          after: value,
        });
      }
    }
  }

  changes.sort((left, right) =>
    compareCodeUnits(left.path, right.path) || compareCodeUnits(left.code, right.code),
  );
  const summary = {
    breaking: changes.filter((change) => change.severity === "breaking").length,
    additive: changes.filter((change) => change.severity === "additive").length,
    behavioral: changes.filter((change) => change.severity === "behavioral").length,
  };
  return { compatible: summary.breaking === 0, changes, summary };
}
