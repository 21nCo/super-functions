export const patternsPackage = {
  name: '@uifn/patterns',
  layer: 'patterns',
  status: 'beta',
  sourcePolicy: 'clean-room',
} as const;

export const PATTERN_NAMES = [
  'AuthPanel',
  'ApiKeyTable',
  'SessionList',
  'UserProfileCard',
  'ProviderPicker',
  'OAuthConnectionsPanel',
  'WebhookEndpointTable',
  'FileDropzonePanel',
  'UploadProgressList',
  'FileListPanel',
  'QuotaUsagePanel',
  'BillingPlanCards',
  'SubscriptionStatusPanel',
  'InvoiceTable',
] as const;

export type PatternName = (typeof PATTERN_NAMES)[number];
export type PatternStatus =
  | 'loading'
  | 'empty'
  | 'error'
  | 'partial'
  | 'permission-denied'
  | 'optimistic'
  | 'success'
  | 'degraded-network'
  | 'unsupported-capability';

export interface PatternError {
  code: string;
  message: string;
}

export interface PatternBaseProps<TData = unknown> {
  data?: TData;
  status: PatternStatus;
  error?: PatternError | null;
  disabled?: boolean;
  className?: string;
}

export interface PatternRenderModel<TData = unknown> {
  name: PatternName;
  status: PatternStatus;
  data: TData | undefined;
  error: PatternError | null;
  disabled: boolean;
  state: {
    loading: boolean;
    empty: boolean;
    error: boolean;
    partial: boolean;
    permissionDenied: boolean;
    optimistic: boolean;
    success: boolean;
    degradedNetwork: boolean;
    unsupportedCapability: boolean;
    itemCount: number;
  };
  callbacks: string[];
  imports: string[];
  backendImports: string[];
}

export interface AuthPanelData {
  user?: { id: string; name: string; email?: string } | null;
  providers: Array<{ id: string; label: string; connected?: boolean }>;
}

export interface ApiKeyRecord {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt?: string | null;
}

export interface SessionRecord {
  id: string;
  device: string;
  location?: string;
  current?: boolean;
  lastActiveAt: string;
}

export interface UserProfileData {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
}

export interface ProviderRecord {
  id: string;
  label: string;
  description?: string;
  connected?: boolean;
  disabled?: boolean;
}

export interface OAuthConnectionRecord {
  id: string;
  providerId: string;
  accountLabel: string;
  status: 'connected' | 'expired' | 'revoked';
}

export interface WebhookEndpointRecord {
  id: string;
  url: string;
  events: string[];
  enabled: boolean;
}

export interface FileRecord {
  id: string;
  name: string;
  size: number;
  status?: 'queued' | 'uploading' | 'uploaded' | 'failed';
}

export interface UploadProgressRecord {
  id: string;
  name: string;
  progress: number;
  status: 'queued' | 'uploading' | 'complete' | 'failed';
}

export interface QuotaUsageData {
  label: string;
  used: number;
  limit: number;
  unit: string;
}

export interface BillingPlanRecord {
  id: string;
  name: string;
  price: string;
  current?: boolean;
  features: string[];
}

export interface SubscriptionStatusData {
  planName: string;
  status: 'active' | 'trialing' | 'past_due' | 'canceled';
  renewalDate?: string | null;
}

export interface InvoiceRecord {
  id: string;
  number: string;
  amount: string;
  status: 'paid' | 'open' | 'void';
  issuedAt: string;
}

export interface AuthPanelProps extends PatternBaseProps<AuthPanelData> {
  onSignIn?: (providerId: string) => void;
  onSignOut?: () => void;
  onSwitchAccount?: () => void;
}

export interface ApiKeyTableProps extends PatternBaseProps<ApiKeyRecord[]> {
  keys?: ApiKeyRecord[];
  onCreate?: () => void;
  onRevoke?: (keyId: string) => void;
}

export interface SessionListProps extends PatternBaseProps<SessionRecord[]> {
  sessions?: SessionRecord[];
  onRevoke?: (sessionId: string) => void;
}

export interface UserProfileCardProps extends PatternBaseProps<UserProfileData> {
  onUpdate?: (profile: Partial<UserProfileData>) => void;
}

export interface ProviderPickerProps extends PatternBaseProps<ProviderRecord[]> {
  providers?: ProviderRecord[];
  onSelect?: (providerId: string) => void;
}

export interface OAuthConnectionsPanelProps extends PatternBaseProps<OAuthConnectionRecord[]> {
  connections?: OAuthConnectionRecord[];
  onConnect?: (providerId: string) => void;
  onDisconnect?: (connectionId: string) => void;
}

export interface WebhookEndpointTableProps extends PatternBaseProps<WebhookEndpointRecord[]> {
  endpoints?: WebhookEndpointRecord[];
  onCreate?: () => void;
  onRotateSecret?: (endpointId: string) => void;
  onDelete?: (endpointId: string) => void;
}

export interface FileDropzonePanelProps extends PatternBaseProps<FileRecord[]> {
  files?: FileRecord[];
  onDrop?: (files: File[]) => void;
  onUpload?: (fileId: string) => void;
  onRemove?: (fileId: string) => void;
}

export interface UploadProgressListProps extends PatternBaseProps<UploadProgressRecord[]> {
  uploads?: UploadProgressRecord[];
  onCancel?: (uploadId: string) => void;
}

export interface FileListPanelProps extends PatternBaseProps<FileRecord[]> {
  files?: FileRecord[];
  onOpen?: (fileId: string) => void;
  onDelete?: (fileId: string) => void;
}

export interface QuotaUsagePanelProps extends PatternBaseProps<QuotaUsageData> {
  onUpgrade?: () => void;
}

export interface BillingPlanCardsProps extends PatternBaseProps<BillingPlanRecord[]> {
  plans?: BillingPlanRecord[];
  onSelectPlan?: (planId: string) => void;
}

export interface SubscriptionStatusPanelProps extends PatternBaseProps<SubscriptionStatusData> {
  onManage?: () => void;
  onCancel?: () => void;
}

export interface InvoiceTableProps extends PatternBaseProps<InvoiceRecord[]> {
  invoices?: InvoiceRecord[];
  onDownload?: (invoiceId: string) => void;
}

const callbackNames = (props: object): string[] =>
  Object.entries(props)
    .filter(([key, value]) => key.startsWith('on') && typeof value === 'function')
    .map(([key]) => key)
    .sort();

const itemCount = (data: unknown): number => {
  if (Array.isArray(data)) {
    return data.length;
  }

  if (data && typeof data === 'object') {
    if ('providers' in data && Array.isArray((data as { providers?: unknown }).providers)) {
      return ((data as { providers: unknown[] }).providers).length;
    }

    return 1;
  }

  return 0;
};

export function createPatternModel<TData>(
  name: PatternName,
  props: PatternBaseProps<TData> & object,
  data: TData | undefined = props.data
): PatternRenderModel<TData> {
  return {
    name,
    status: props.status,
    data,
    error: props.error ?? null,
    disabled: props.disabled ?? false,
    state: {
      loading: props.status === 'loading',
      empty: props.status === 'empty',
      error: props.status === 'error',
      partial: props.status === 'partial',
      permissionDenied: props.status === 'permission-denied',
      optimistic: props.status === 'optimistic',
      success: props.status === 'success',
      degradedNetwork: props.status === 'degraded-network',
      unsupportedCapability: props.status === 'unsupported-capability',
      itemCount: itemCount(data),
    },
    callbacks: callbackNames(props),
    imports: ['@uifn/components-react'],
    backendImports: [],
  };
}

export const AuthPanel = (props: AuthPanelProps) => createPatternModel('AuthPanel', props);
export const ApiKeyTable = (props: ApiKeyTableProps) => createPatternModel('ApiKeyTable', props, props.keys ?? props.data);
export const SessionList = (props: SessionListProps) => createPatternModel('SessionList', props, props.sessions ?? props.data);
export const UserProfileCard = (props: UserProfileCardProps) => createPatternModel('UserProfileCard', props);
export const ProviderPicker = (props: ProviderPickerProps) => createPatternModel('ProviderPicker', props, props.providers ?? props.data);
export const OAuthConnectionsPanel = (props: OAuthConnectionsPanelProps) =>
  createPatternModel('OAuthConnectionsPanel', props, props.connections ?? props.data);
export const WebhookEndpointTable = (props: WebhookEndpointTableProps) =>
  createPatternModel('WebhookEndpointTable', props, props.endpoints ?? props.data);
export const FileDropzonePanel = (props: FileDropzonePanelProps) => createPatternModel('FileDropzonePanel', props, props.files ?? props.data);
export const UploadProgressList = (props: UploadProgressListProps) =>
  createPatternModel('UploadProgressList', props, props.uploads ?? props.data);
export const FileListPanel = (props: FileListPanelProps) => createPatternModel('FileListPanel', props, props.files ?? props.data);
export const QuotaUsagePanel = (props: QuotaUsagePanelProps) => createPatternModel('QuotaUsagePanel', props);
export const BillingPlanCards = (props: BillingPlanCardsProps) => createPatternModel('BillingPlanCards', props, props.plans ?? props.data);
export const SubscriptionStatusPanel = (props: SubscriptionStatusPanelProps) =>
  createPatternModel('SubscriptionStatusPanel', props);
export const InvoiceTable = (props: InvoiceTableProps) => createPatternModel('InvoiceTable', props, props.invoices ?? props.data);
