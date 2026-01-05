import type { TableSchema } from '@superfunctions/db';

/**
 * What each library must export for CLI schema generation
 */
export interface LibrarySchemaGenerator {
  // Library metadata
  name: string;
  version: number;
  
  // Generate schema from config
  getSchema(config: any): LibrarySchema;
}

/**
 * Schema format returned by library's getSchema() function
 */
export interface LibrarySchema {
  version: number;
  schemas: TableSchema[];
}

/**
 * Config file structure (library-specific)
 * Each library defines its own config structure
 */
export interface LibraryConfig {
  // Library-specific options (field names, namespaces, etc)
  [key: string]: any;
}
