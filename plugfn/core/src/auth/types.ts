import type { OAuthStateRecord, OAuthStateStore } from '@superfunctions/oauth-storage';

export type TokenStore = OAuthStateStore;

export type OAuthState = {
  userId: string;
  provider: string;
  redirectUri: string;
  scopes?: string[];
  connectionName?: string;
  timestamp: number;
};

export type OAuthStateRecordCompat = OAuthStateRecord;
