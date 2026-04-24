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
  const tables: string[] = [];

  // Map dialect to Drizzle table builder and core module
  const dialectMap = {
    postgres: { builder: 'pgTable', core: 'drizzle-orm/pg-core' },
    mysql: { builder: 'mysqlTable', core: 'drizzle-orm/mysql-core' },
    sqlite: { builder: 'sqliteTable', core: 'drizzle-orm/sqlite-core' }
  };

  const { builder: tableBuilder, core: coreModule } = dialectMap[dialect];
  imports.add(`import { ${tableBuilder}, text, integer, boolean, timestamp, json, bigint } from '${coreModule}';`);

  for (const table of normalizedSchema.schemas) {
    const tableName = table.modelName;
    const tableNameSnakeCase = resolvePhysicalTableName(namespace, tableName);

    const fields: string[] = [];

    // Generate field definitions
    for (const [fieldKey, fieldValue] of Object.entries(table.fields)) {
      const field = fieldValue as FieldSchema;
      const fieldName = field.fieldName || fieldKey;
      const drizzleType = mapTypeToDrizzle(field.type);

      // Drizzle's default timestamp mode accepts Date objects, which is what
      // Superfunctions runtime packages persist through the shared DB adapter.
      // For bigint fields, add mode: 'bigint' for full precision
      let typeConfig = '';
      if (field.type === 'bigint') {
        typeConfig = "{ mode: 'bigint' }";
      }
      let fieldDef = `  ${fieldKey}: ${drizzleType}('${fieldName}'${typeConfig ? `, ${typeConfig}` : ''})`;

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

    // Generate table
    const tableCode = `
export const ${tableName} = ${tableBuilder}('${tableNameSnakeCase}', {
${fields.join('\n')}
});`;

    tables.push(tableCode);
  }

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

function mapTypeToDrizzle(type: string): string {
  switch (type) {
    case 'string':
      return 'text';
    case 'number':
      return 'integer';
    case 'bigint':
      return 'bigint';
    case 'boolean':
      return 'boolean';
    case 'date':
      return 'timestamp';
    case 'json':
      return 'json';
    default:
      return 'text';
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
      const prismaType = mapTypeToPrisma(field.type);
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

function mapTypeToPrisma(type: string): string {
  switch (type) {
    case 'string':
      return 'String';
    case 'number':
      return 'Int';
    case 'bigint':
      return 'BigInt';
    case 'boolean':
      return 'Boolean';
    case 'date':
      return 'DateTime';
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
      const tsType = mapTypeToTypeScript(field.type);
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

function mapTypeToTypeScript(type: string): string {
  switch (type) {
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'bigint':
      return 'bigint';
    case 'boolean':
      return 'boolean';
    case 'date':
      return 'Date';
    case 'json':
      return 'unknown';
    default:
      return 'unknown';
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
