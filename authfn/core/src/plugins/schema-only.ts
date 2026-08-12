import type { TableSchema } from '@superfunctions/db';
import type { AuthFnPlugin } from '../types.js';

export interface AuthFnSchemaOnlyPluginConfig {
  name: string;
  schema: TableSchema[];
}

export function authFnSchemaPlugin(config: AuthFnSchemaOnlyPluginConfig): AuthFnPlugin {
  return {
    name: config.name,
    schema: () => config.schema
  };
}
