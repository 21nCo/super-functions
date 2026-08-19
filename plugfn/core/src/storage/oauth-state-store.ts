import type { Adapter as DbAdapter } from '@superfunctions/db';
import {
  DbAdapterOAuthStateStore,
  type OAuthStateStore,
} from '@superfunctions/oauth-storage';
import {
  DEFAULT_PLUGFN_STORAGE_MODELS,
  type PlugFnStorageModelMapping,
} from './adapters/database.js';

export function createPlugFnOAuthStateStore(
  database: DbAdapter,
  models?: Partial<PlugFnStorageModelMapping>
): OAuthStateStore {
  return new DbAdapterOAuthStateStore(
    database,
    models?.oauthStates ?? DEFAULT_PLUGFN_STORAGE_MODELS.oauthStates
  );
}
