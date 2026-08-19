import type { TableSchema } from '@superfunctions/db';
import type { AuthFnPlugin } from 'authfn';

export interface AuthFnSchemaOnlyPluginConfig {
  name: string;
  schema: TableSchema[];
}

export function authFnSchemaPlugin<const TName extends string>(
  config: AuthFnSchemaOnlyPluginConfig & { name: TName }
): AuthFnPlugin<TName> {
  return {
    name: config.name,
    schema: () => config.schema
  };
}
