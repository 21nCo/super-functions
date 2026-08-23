import {
  ApiKeyTable,
  AuthPanel,
  SessionList,
  UserProfileCard,
  type ApiKeyRecord,
  type AuthPanelData,
  type PatternStatus,
  type SessionRecord,
  type UserProfileData,
} from '@uifn/patterns';
import { resolveBackedData, withSuperfunctionBacking, type SfPatternModel } from '../shared';

export interface AuthFnClient {
  getAuthPanelData: () => Promise<AuthPanelData>;
  listApiKeys: () => Promise<ApiKeyRecord[]>;
  listSessions: () => Promise<SessionRecord[]>;
  getUserProfile: () => Promise<UserProfileData>;
  createApiKey?: () => Promise<ApiKeyRecord>;
  revokeApiKey?: (keyId: string) => Promise<void>;
  revokeSession?: (sessionId: string) => Promise<void>;
  updateProfile?: (profile: Partial<UserProfileData>) => Promise<UserProfileData>;
  signIn?: (providerId: string) => Promise<void>;
  signOut?: () => Promise<void>;
  switchAccount?: () => Promise<void>;
}

export interface AuthFnAuthPanelProps {
  authClient: AuthFnClient;
  status?: PatternStatus;
  data?: AuthPanelData;
}

export interface AuthFnApiKeyTableProps {
  authClient: AuthFnClient;
  status?: PatternStatus;
  keys?: ApiKeyRecord[];
}

export interface AuthFnSessionListProps {
  authClient: AuthFnClient;
  status?: PatternStatus;
  sessions?: SessionRecord[];
}

export interface AuthFnUserProfileCardProps {
  authClient: AuthFnClient;
  status?: PatternStatus;
  profile?: UserProfileData;
}

export async function AuthFnAuthPanel(props: AuthFnAuthPanelProps): Promise<SfPatternModel<AuthPanelData>> {
  const resolved = await resolveBackedData(props.status, props.data, () => props.authClient.getAuthPanelData());
  return withSuperfunctionBacking(
    AuthPanel({
      status: resolved.status,
      data: resolved.data,
      error: resolved.error,
      onSignIn: (providerId) => void props.authClient.signIn?.(providerId),
      onSignOut: () => void props.authClient.signOut?.(),
      onSwitchAccount: () => void props.authClient.switchAccount?.(),
    }),
    {
      superfunction: 'authfn',
      controlledCounterpart: 'AuthPanel',
      clientContract: 'AuthFnClient',
    }
  );
}

export async function AuthFnApiKeyTable(props: AuthFnApiKeyTableProps): Promise<SfPatternModel<ApiKeyRecord[]>> {
  const resolved = await resolveBackedData(props.status, props.keys, () => props.authClient.listApiKeys());
  return withSuperfunctionBacking(
    ApiKeyTable({
      status: resolved.status,
      keys: resolved.data,
      error: resolved.error,
      onCreate: () => void props.authClient.createApiKey?.(),
      onRevoke: (keyId) => void props.authClient.revokeApiKey?.(keyId),
    }),
    {
      superfunction: 'authfn',
      controlledCounterpart: 'ApiKeyTable',
      clientContract: 'AuthFnClient',
    }
  );
}

export async function AuthFnSessionList(props: AuthFnSessionListProps): Promise<SfPatternModel<SessionRecord[]>> {
  const resolved = await resolveBackedData(props.status, props.sessions, () => props.authClient.listSessions());
  return withSuperfunctionBacking(
    SessionList({
      status: resolved.status,
      sessions: resolved.data,
      error: resolved.error,
      onRevoke: (sessionId) => void props.authClient.revokeSession?.(sessionId),
    }),
    {
      superfunction: 'authfn',
      controlledCounterpart: 'SessionList',
      clientContract: 'AuthFnClient',
    }
  );
}

export async function AuthFnUserProfileCard(
  props: AuthFnUserProfileCardProps
): Promise<SfPatternModel<UserProfileData>> {
  const resolved = await resolveBackedData(props.status, props.profile, () => props.authClient.getUserProfile());
  return withSuperfunctionBacking(
    UserProfileCard({
      status: resolved.status,
      data: resolved.data,
      error: resolved.error,
      onUpdate: (profile) => void props.authClient.updateProfile?.(profile),
    }),
    {
      superfunction: 'authfn',
      controlledCounterpart: 'UserProfileCard',
      clientContract: 'AuthFnClient',
    }
  );
}
