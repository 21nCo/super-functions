import { MemoryOAuthStateStore, type OAuthStateStore } from '@superfunctions/oauth-storage';

export class OAuthStateTokenStore extends MemoryOAuthStateStore {}

export function createOAuthStateTokenStore(): OAuthStateStore {
  return new OAuthStateTokenStore();
}
