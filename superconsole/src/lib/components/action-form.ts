import { validateAdminValue, type AdminJsonSchema } from '@superfunctions/admin';
import type { AdminActionViewModel } from './view-models';

export type ActionFieldType = 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'json';
export type ActionDraftValue = string | boolean | undefined;
export type ActionDraft = Record<string, ActionDraftValue>;

export interface ActionInputField {
  name: string;
  label: string;
  description?: string;
  type: ActionFieldType;
  required: boolean;
  schema: AdminJsonSchema;
}

export type ActionInputResult =
  | { ok: true; input: Record<string, unknown>; errors: Record<string, never> }
  | { ok: false; input: Record<string, unknown>; errors: Record<string, string> };

function fieldLabel(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .replace(/^./, (character) => character.toUpperCase());
}

type DeclaredFieldType = Exclude<ActionFieldType, 'json'> | 'null';

function declaredFieldTypes(schema: AdminJsonSchema): Set<DeclaredFieldType> {
  const declared = new Set<DeclaredFieldType>();
  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  for (const type of types) {
    if (['string', 'number', 'integer', 'boolean', 'object', 'array', 'null'].includes(type)) {
      declared.add(type as DeclaredFieldType);
    }
  }
  for (const branch of [...schema.allOf ?? [], ...schema.anyOf ?? [], ...schema.oneOf ?? []]) {
    for (const type of declaredFieldTypes(branch)) declared.add(type);
  }
  return declared;
}

function fieldType(schema: AdminJsonSchema): ActionFieldType {
  const declared = [...declaredFieldTypes(schema)];
  if (declared.length === 1) return declared[0] === 'null' ? 'json' : declared[0];
  return declared.length > 1 ? 'json' : 'string';
}

export function editableActionFields(action: AdminActionViewModel): ActionInputField[] {
  const schema = action.inputSchema;
  if (!schema) return [];
  const properties: Record<string, AdminJsonSchema> = {};
  const required = new Set<string>();
  const collectObjectShape = (candidate: AdminJsonSchema): void => {
    for (const name of candidate.required ?? []) required.add(name);
    for (const [name, property] of Object.entries(candidate.properties ?? {})) {
      const existing = properties[name];
      properties[name] = existing
        ? {
            ...existing,
            ...property,
            type: property.type ?? existing.type,
            title: property.title ?? existing.title,
            description: property.description ?? existing.description,
            allOf: [existing, property],
          }
        : property;
    }
    for (const branch of candidate.allOf ?? []) collectObjectShape(branch);
  };
  collectObjectShape(schema);
  return Object.entries(properties).flatMap(([name, property]) => {
    if (name === action.targetIdInput) return [];
    return [{
      name,
      label: property.title ?? fieldLabel(name),
      description: property.description,
      type: fieldType(property),
      required: required.has(name),
      schema: property,
    }];
  });
}

function initialValue(field: ActionInputField, value: unknown): ActionDraftValue {
  const candidate = value === undefined ? field.schema.default : value;
  if (field.type === 'boolean') {
    return typeof candidate === 'boolean' ? candidate : field.required ? false : undefined;
  }
  if (candidate === undefined) return '';
  if (field.type === 'object' || field.type === 'array' || field.type === 'json') {
    return JSON.stringify(candidate, null, 2);
  }
  if (candidate === null) return '';
  return String(candidate);
}

function schemaTypeMatches(schema: AdminJsonSchema, value: unknown): boolean {
  const declared = schema.type ? (Array.isArray(schema.type) ? schema.type : [schema.type]) : [];
  if (declared.length === 0) return true;
  return declared.some((type) => {
    if (type === 'null') return value === null;
    if (type === 'array') return Array.isArray(value);
    if (type === 'object') return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
    if (type === 'integer') return typeof value === 'number' && Number.isInteger(value);
    return typeof value === type;
  });
}

function nestedSchemaError(schema: AdminJsonSchema, value: unknown, path: string): string | undefined {
  for (const candidate of schema.allOf ?? []) {
    const error = nestedSchemaError(candidate, value, path);
    if (error) return error;
  }
  if (schema.anyOf !== undefined && !schema.anyOf.some((candidate) => nestedSchemaError(candidate, value, path) === undefined)) {
    return `${path} must match at least one allowed schema.`;
  }
  if (schema.oneOf !== undefined && schema.oneOf.filter((candidate) => nestedSchemaError(candidate, value, path) === undefined).length !== 1) {
    return `${path} must match exactly one allowed schema.`;
  }
  if (!schemaTypeMatches(schema, value)) return `${path} has the wrong value type.`;
  if (schema.const !== undefined && validateAdminValue({ const: schema.const }, value).length > 0) return `${path} must equal the declared constant.`;
  if (Array.isArray(schema.enum) && !schema.enum.some((candidate) => validateAdminValue({ const: candidate }, value).length === 0)) {
    return `${path} must be one of the declared values.`;
  }
  if (typeof value === 'string') {
    const length = Array.from(value).length;
    if (typeof schema.minLength === 'number' && length < schema.minLength) return `${path} is too short.`;
    if (typeof schema.maxLength === 'number' && length > schema.maxLength) return `${path} is too long.`;
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) return `${path} has an invalid format.`;
  }
  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) return `${path} is below the minimum.`;
    if (typeof schema.maximum === 'number' && value > schema.maximum) return `${path} exceeds the maximum.`;
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) return `${path} has too few items.`;
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) return `${path} has too many items.`;
    if (schema.uniqueItems && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) return `${path} must contain unique items.`;
    if (schema.items) {
      for (let index = 0; index < value.length; index += 1) {
        const error = nestedSchemaError(schema.items, value[index], `${path}[${index}]`);
        if (error) return error;
      }
    }
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    for (const required of schema.required ?? []) {
      if (!(required in record)) return `${path}.${required} is required.`;
    }
    for (const [key, child] of Object.entries(record)) {
      const property = schema.properties?.[key];
      if (!property) {
        if (schema.additionalProperties === false) return `${path}.${key} is not allowed.`;
        if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
          const error = nestedSchemaError(schema.additionalProperties, child, `${path}.${key}`);
          if (error) return error;
        }
        continue;
      }
      const error = nestedSchemaError(property, child, `${path}.${key}`);
      if (error) return error;
    }
  }
  return undefined;
}

export function createActionDraft(action: AdminActionViewModel): ActionDraft {
  return Object.fromEntries(
    editableActionFields(action).map((field) => [
      field.name,
      initialValue(field, action.input?.[field.name]),
    ])
  );
}

function parseField(field: ActionInputField, raw: ActionDraftValue): { value?: unknown; error?: string; omit?: boolean } {
  if (field.type === 'boolean') {
    if (raw === undefined) {
      return field.required
        ? { error: `${field.label} is required.` }
        : { omit: true };
    }
    const value = raw === true;
    const error = nestedSchemaError(field.schema, value, field.label);
    return error ? { error } : { value };
  }

  const text = typeof raw === 'string' ? raw : '';
  if (!text.trim()) {
    return field.required
      ? { error: `${field.label} is required.` }
      : { omit: true };
  }

  if (field.type === 'number' || field.type === 'integer') {
    const value = Number(text);
    if (!Number.isFinite(value) || (field.type === 'integer' && !Number.isInteger(value))) {
      return { error: `${field.label} must be a valid ${field.type}.` };
    }
    const error = nestedSchemaError(field.schema, value, field.label);
    return error ? { error } : { value };
  }

  if (field.type === 'object' || field.type === 'array' || field.type === 'json') {
    try {
      const value: unknown = JSON.parse(text);
      if (field.type !== 'json' && (field.type === 'array' ? !Array.isArray(value) : typeof value !== 'object' || value === null || Array.isArray(value))) {
        return { error: `${field.label} must be a JSON ${field.type}.` };
      }
      const nestedError = nestedSchemaError(field.schema, value, field.label);
      if (nestedError) return { error: nestedError };
      return { value };
    } catch {
      return { error: `${field.label} must contain valid JSON.` };
    }
  }

  const error = nestedSchemaError(field.schema, text, field.label);
  return error ? { error } : { value: text };
}

export function validateActionInput(action: AdminActionViewModel, draft: ActionDraft): ActionInputResult {
  const input = { ...(action.input ?? {}) };
  const errors: Record<string, string> = {};
  for (const field of editableActionFields(action)) {
    const parsed = parseField(field, draft[field.name]);
    if (parsed.error) {
      errors[field.name] = parsed.error;
      continue;
    }
    if (parsed.omit) delete input[field.name];
    else input[field.name] = parsed.value;
  }
  return Object.keys(errors).length
    ? { ok: false, input, errors }
    : { ok: true, input, errors: {} };
}
