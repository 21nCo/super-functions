/**
 * Generate ORM-specific schema files from abstract schema
 */

import type { TableSchema, FieldSchema } from '@superfunctions/db';
import { resolvePhysicalTableName } from './schema-diff.js';

interface AbstractSchema {
  version: number;
  schemas: TableSchema[];
}

export class CliSchemaGenerationError extends Error {
  readonly code: "CLI_SCHEMA_GENERATION_ERROR";
  readonly details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "CliSchemaGenerationError";
    this.code = "CLI_SCHEMA_GENERATION_ERROR";
    this.details = details;
  }
}

export async function generateLibraryAbstractSchema(
  libraryPackage: { getSchema?: (config: unknown) => AbstractSchema | Promise<AbstractSchema> },
  config: unknown
): Promise<AbstractSchema> {
  if (typeof libraryPackage.getSchema !== "function") {
    throw new CliSchemaGenerationError("library does not export getSchema", {
      reason: "missing-get-schema"
    });
  }

  const generated = await Promise.resolve(libraryPackage.getSchema(config));
  return normalizeAbstractSchema(generated);
}

export function normalizeAbstractSchema(abstractSchema: AbstractSchema): AbstractSchema {
  return {
    version: abstractSchema.version,
    schemas: abstractSchema.schemas.map((schema) => ({
      modelName: schema.modelName,
      fields: Object.fromEntries(
        Object.entries(schema.fields)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([fieldName, field]) => [fieldName, normalizeFieldSchema(field)])
      ),
      indexes: schema.indexes
        ? [...schema.indexes]
            .map((index) => ({
              ...index,
              fields: [...index.fields]
            }))
            .sort((left, right) => left.name.localeCompare(right.name))
        : undefined,
      constraints: schema.constraints
        ? [...schema.constraints]
            .map((constraint) => ({
              ...constraint,
              fields: [...constraint.fields]
            }))
            .sort((left, right) => left.name.localeCompare(right.name))
        : undefined
    }))
  };
}

// ============================================================================
// Drizzle Schema Generator
// ============================================================================

export function generateDrizzleSchemaFile(
  abstractSchema: AbstractSchema,
  libraryName: string,
  namespace: string,
  dialect: 'postgres' | 'mysql' | 'sqlite' = 'postgres'
): string {
  const normalizedSchema = normalizeAbstractSchema(abstractSchema);
  const imports = new Set<string>();
  const drizzleImports = new Set<string>();
  const tables: string[] = [];

  // Map dialect to Drizzle table builder and core module
  const dialectMap = {
    postgres: { builder: 'pgTable', core: 'drizzle-orm/pg-core' },
    mysql: { builder: 'mysqlTable', core: 'drizzle-orm/mysql-core' },
    sqlite: { builder: 'sqliteTable', core: 'drizzle-orm/sqlite-core' }
  };

  const { builder: tableBuilder, core: coreModule } = dialectMap[dialect];
  drizzleImports.add(tableBuilder);

  for (const table of normalizedSchema.schemas) {
    const tableName = table.modelName;
    const tableNameSnakeCase = resolvePhysicalTableName(namespace, tableName);

    const fields: string[] = [];

    // Generate field definitions
    for (const [fieldKey, fieldValue] of Object.entries(table.fields)) {
      const field = fieldValue as FieldSchema;
      const fieldName = field.fieldName || fieldKey;
      const drizzleField = mapFieldToDrizzle(field, dialect);
      drizzleImports.add(drizzleField.type);

      let fieldDef = `  ${fieldKey}: ${drizzleField.type}('${fieldName}'${drizzleField.config ? `, ${drizzleField.config}` : ''})`;

      // Add constraints
      if (fieldKey === 'id') {
        fieldDef += '.primaryKey()';
      }
      if (field.required) {
        fieldDef += '.notNull()';
      }
      if (field.unique) {
        fieldDef += '.unique()';
      }
      if (field.defaultValue !== undefined) {
        const defaultVal = typeof field.defaultValue === 'string'
          ? `"${field.defaultValue}"`
          : field.defaultValue;
        fieldDef += `.default(${defaultVal})`;
      }
      if (field.references) {
        fieldDef += `.references(() => ${field.references.model}.${field.references.field})`;
      }

      fieldDef += ',';
      fields.push(fieldDef);
    }

    const indexes = renderDrizzleIndexes(table);
    if (indexes.length > 0) {
      drizzleImports.add('index');
      drizzleImports.add('uniqueIndex');
    }

    // Generate table
    const tableCode = indexes.length > 0
      ? `
export const ${tableName} = ${tableBuilder}(
  '${tableNameSnakeCase}',
  {
${fields.join('\n')}
  },
  (table) => ({
${indexes.join(',\n')}
  })
);`
      : `
export const ${tableName} = ${tableBuilder}('${tableNameSnakeCase}', {
${fields.join('\n')}
});`;

    tables.push(tableCode);
  }

  imports.add(`import { ${Array.from(drizzleImports).sort().join(', ')} } from '${coreModule}';`);

  // Generate file content
  const header = `/**
 * Auto-generated Drizzle schema for ${libraryName}
 * Generated by Superfunctions CLI
 * 
 * DO NOT EDIT MANUALLY
 * 
 * To regenerate: npx superfunctions generate-schema
 */
`;

  return header + '\n' + Array.from(imports).join('\n') + '\n' + tables.join('\n\n');
}

function renderDrizzleIndexes(table: TableSchema): string[] {
  const usedKeys = new Set<string>();
  return (table.indexes ?? []).map((schemaIndex) => {
    const key = uniqueObjectKey(toCamelCase(schemaIndex.name), usedKeys);
    const builder = schemaIndex.unique ? 'uniqueIndex' : 'index';
    const columns = schemaIndex.fields.map((field) => `table.${field}`).join(', ');
    return `    ${key}: ${builder}('${schemaIndex.name}').on(${columns})`;
  });
}

function uniqueObjectKey(base: string, usedKeys: Set<string>): string {
  const root = base || 'idx';
  let candidate = root;
  let counter = 2;
  while (usedKeys.has(candidate)) {
    candidate = `${root}${counter}`;
    counter += 1;
  }
  usedKeys.add(candidate);
  return candidate;
}

function toCamelCase(value: string): string {
  return value
    .replace(/^[^a-zA-Z_$]+/, '')
    .replace(/[^a-zA-Z0-9_$]+([a-zA-Z0-9_$])/g, (_, char: string) => char.toUpperCase())
    .replace(/[^a-zA-Z0-9_$]/g, '');
}

function mapFieldToDrizzle(
  field: FieldSchema,
  dialect: 'postgres' | 'mysql' | 'sqlite'
): { type: string; config?: string } {
  if (isDateField(field)) {
    switch (resolveDateStorageType(field)) {
      case 'timestamp':
        return dialect === 'sqlite'
          ? { type: 'integer', config: "{ mode: 'timestamp_ms' }" }
          : { type: 'timestamp' };
      case 'timestamptz':
        return dialect === 'sqlite'
          ? { type: 'integer', config: "{ mode: 'timestamp_ms' }" }
          : dialect === 'postgres'
            ? { type: 'timestamp', config: '{ withTimezone: true }' }
            : { type: 'timestamp' };
      case 'iso-text':
        return { type: 'text' };
      case 'epoch-ms-integer':
        return { type: 'integer' };
      case 'epoch-ms-bigint':
        return dialect === 'sqlite'
          ? { type: 'integer' }
          : { type: 'bigint', config: "{ mode: 'number' }" };
    }
  }

  switch (field.type) {
    case 'string':
      return { type: 'text' };
    case 'number':
      return { type: 'integer' };
    case 'bigint':
      return { type: 'bigint', config: "{ mode: 'bigint' }" };
    case 'boolean':
      return { type: 'boolean' };
    case 'json':
      return { type: 'json' };
    default:
      return { type: 'text' };
  }
}

// ============================================================================
// Prisma Schema Generator
// ============================================================================

export function generatePrismaSchemaFile(
  abstractSchema: AbstractSchema,
  libraryName: string,
  namespace: string
): string {
  const normalizedSchema = normalizeAbstractSchema(abstractSchema);
  const models: string[] = [];

  for (const table of normalizedSchema.schemas) {
    const modelName = capitalize(table.modelName);
    const fields: string[] = [];

    for (const [fieldKey, fieldValue] of Object.entries(table.fields)) {
      const field = fieldValue as FieldSchema;
      const fieldName = field.fieldName || fieldKey;
      const prismaType = mapFieldToPrisma(field);
      const optionalMarker = field.required ? '' : '?';

      let fieldDef = `  ${fieldName} ${prismaType}${optionalMarker}`;

      // Add constraints
      if (fieldKey === 'id') {
        fieldDef += ' @id';
      }
      if (field.unique) {
        fieldDef += ' @unique';
      }
      if (field.defaultValue !== undefined) {
        const defaultVal = typeof field.defaultValue === 'string'
          ? `"${field.defaultValue}"`
          : field.defaultValue;
        fieldDef += ` @default(${defaultVal})`;
      }
      if (field.references) {
        fieldDef += ` @relation(references: [${field.references.field}])`;
      }

      fields.push(fieldDef);
    }

    const modelCode = `
model ${modelName} {
${fields.join('\n')}
  
  @@map("${resolvePhysicalTableName(namespace, table.modelName)}")
}`;

    models.push(modelCode);
  }

  const header = `// Auto-generated Prisma schema for ${libraryName}
// Generated by Superfunctions CLI
// 
// DO NOT EDIT MANUALLY
// 
// To regenerate: npx superfunctions generate-schema --adapter prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
`;

  return header + '\n' + models.join('\n\n');
}

function mapFieldToPrisma(field: FieldSchema): string {
  if (isDateField(field)) {
    switch (resolveDateStorageType(field)) {
      case 'timestamp':
      case 'timestamptz':
        return 'DateTime';
      case 'iso-text':
        return 'String';
      case 'epoch-ms-integer':
        return 'Int';
      case 'epoch-ms-bigint':
        return 'BigInt';
    }
  }

  switch (field.type) {
    case 'string':
      return 'String';
    case 'number':
      return 'Int';
    case 'bigint':
      return 'BigInt';
    case 'boolean':
      return 'Boolean';
    case 'json':
      return 'Json';
    default:
      return 'String';
  }
}

// ============================================================================
// Kysely Schema Generator  
// ============================================================================

export function generateKyselySchemaFile(
  abstractSchema: AbstractSchema,
  libraryName: string,
  _namespace: string
): string {
  const normalizedSchema = normalizeAbstractSchema(abstractSchema);
  // Kysely uses TypeScript interfaces for schema
  const interfaces: string[] = [];

  for (const table of normalizedSchema.schemas) {
    const interfaceName = capitalize(table.modelName) + 'Table';
    const fields: string[] = [];

    for (const [fieldKey, fieldValue] of Object.entries(table.fields)) {
      const field = fieldValue as FieldSchema;
      const tsType = mapFieldToTypeScript(field);
      const optional = field.required ? '' : '?';
      fields.push(`  ${fieldKey}${optional}: ${tsType};`);
    }

    const interfaceCode = `
export interface ${interfaceName} {
${fields.join('\n')}
}`;

    interfaces.push(interfaceCode);
  }

  // Generate Database interface
  const tableNames = normalizedSchema.schemas.map(t => t.modelName);
  const dbInterface = `
export interface Database {
${tableNames.map(name => `  ${name}: ${capitalize(name)}Table;`).join('\n')}
}`;

  const header = `/**
 * Auto-generated Kysely types for ${libraryName}
 * Generated by Superfunctions CLI
 * 
 * DO NOT EDIT MANUALLY
 * 
 * To regenerate: npx superfunctions generate-schema --adapter kysely
 */
`;

  return header + '\n' + interfaces.join('\n\n') + '\n' + dbInterface;
}

function mapFieldToTypeScript(field: FieldSchema): string {
  if (isDateField(field)) {
    switch (resolveDateValueType(field)) {
      case 'date':
        return 'Date';
      case 'iso-string':
        return 'string';
      case 'epoch-ms':
        return 'number';
    }
  }

  switch (field.type) {
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'bigint':
      return 'bigint';
    case 'boolean':
      return 'boolean';
    case 'json':
      return 'unknown';
    default:
      return 'unknown';
  }
}

function isDateField(field: FieldSchema): boolean {
  return field.type === 'date' || field.type === 'datetime';
}

function resolveDateValueType(field: FieldSchema): NonNullable<FieldSchema['dateValueType']> {
  return field.dateValueType ?? 'date';
}

function resolveDateStorageType(field: FieldSchema): NonNullable<FieldSchema['dateStorageType']> {
  if (field.dateStorageType) {
    return field.dateStorageType;
  }

  switch (resolveDateValueType(field)) {
    case 'date':
      return 'timestamp';
    case 'iso-string':
      return 'iso-text';
    case 'epoch-ms':
      return 'epoch-ms-bigint';
  }
}

function normalizeFieldSchema(field: FieldSchema): FieldSchema {
  return {
    ...field,
    references: field.references ? { ...field.references } : undefined
  };
}

// ============================================================================
// Utilities
// ============================================================================

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
