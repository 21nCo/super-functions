import type {
  AdminActor,
  AdminAuditEvent,
  AdminCapabilityAdapter,
  AdminConfirmationVerifier,
  AdminIdempotencyStore,
  AdminOperationContext,
  AdminPolicyEvaluator,
  AdminScope,
  AdminAuditSink,
} from '@superfunctions/admin';

export interface SuperConsoleScopeOption {
  id: string;
  name: string;
  slug?: string;
}

export interface SuperConsoleContextOptions {
  installation?: SuperConsoleScopeOption;
  organization?: SuperConsoleScopeOption;
  workspace?: SuperConsoleScopeOption;
  project?: SuperConsoleScopeOption;
  environment?: SuperConsoleScopeOption;
  installations?: readonly SuperConsoleScopeOption[];
  organizations?: readonly SuperConsoleScopeOption[];
  workspaces?: readonly SuperConsoleScopeOption[];
  projects?: readonly SuperConsoleScopeOption[];
  environments?: readonly SuperConsoleScopeOption[];
}

export interface SuperConsolePrincipal {
  actor: AdminActor;
  displayName: string;
  email?: string;
  avatarUrl?: string;
  role: string;
  defaultScope: AdminScope;
  contextOptions?: SuperConsoleContextOptions;
  authentication?: Readonly<{
    sessionId?: string;
    type?: string;
    methods?: readonly string[];
    /** Exact provider-defined CSRF cookie selected for this request/runtime. */
    csrfCookieName?: string;
    /** Exact provider-defined CSRF request header. */
    csrfHeaderName?: string;
  }>;
}

export interface SuperConsoleSignInResult {
  principal: SuperConsolePrincipal;
  headers?: HeadersInit;
}

export interface SuperConsoleSignOutResult {
  headers?: HeadersInit;
}

export interface SuperConsoleOperatorAuth {
  authenticate(request: Request): Promise<SuperConsolePrincipal | null>;
  authorizeScope(input: {
    principal: SuperConsolePrincipal;
    requested: AdminScope;
    request: Request;
  }): Promise<AdminScope | null>;
  /** Required at startup whenever an enabled operation can mutate state. */
  authorizeMutation?(input: {
    principal: SuperConsolePrincipal;
    request: Request;
  }): Promise<void>;
  signIn?(input: { email: string; password: string; request: Request }): Promise<SuperConsoleSignInResult>;
  completeTwoFactor?(input: { challengeId: string; code: string; request: Request }): Promise<SuperConsoleSignInResult>;
  signOut?(input: { principal: SuperConsolePrincipal | null; request: Request }): Promise<SuperConsoleSignOutResult>;
  /** Optionally translate provider-owned errors into a safe HTTP response. */
  mapError?(error: unknown): Response | undefined;
}

export interface SuperConsoleShellPolicy {
  authorize(input: {
    surface: 'registry' | 'overview' | 'api' | 'mcp' | 'settings' | 'audit' | 'search';
    principal: SuperConsolePrincipal;
    context: AdminOperationContext;
  }): Promise<boolean> | boolean;
}

export interface SuperConsoleSearchResult {
  id: string;
  title: string;
  description?: string;
  moduleId: string;
  resource?: string;
  href: string;
  status?: string;
  updatedAt?: string;
}

export interface SuperConsoleSearchService {
  /** Inject a provider-neutral scoped query service. */
  search(input: {
    query: string;
    limit: number;
    cursor?: string;
    context: AdminOperationContext;
  }): Promise<{ results: readonly SuperConsoleSearchResult[]; total?: number; nextCursor?: string }>;
  /** Permission enforced before the query service is called. */
  permission: string;
}

export interface SuperConsoleAuditQuery {
  /** Inject an audit-store-backed query. */
  list(input: {
    cursor?: string;
    limit: number;
    filters: Readonly<Record<string, string>>;
    context: AdminOperationContext;
  }): Promise<{ events: readonly AdminAuditEvent[]; total?: number; nextCursor?: string }>;
  /** Permission enforced before the audit query service is called. */
  permission: string;
}

export interface SuperConsoleOverviewService {
  read(input: { context: AdminOperationContext }): Promise<{
    metrics?: readonly Record<string, unknown>[];
    alerts?: readonly Record<string, unknown>[];
    activity?: readonly Record<string, unknown>[];
    health?: readonly Record<string, unknown>[];
  }>;
  permission?: string;
}

export interface SuperConsoleSettingsService {
  read(input: { context: AdminOperationContext }): Promise<{
    policies?: readonly Record<string, unknown>[];
    retention?: readonly Record<string, unknown>[];
  }>;
  permission?: string;
  /** A function-owned admin operation; transport mutations always use the dispatcher. */
  updatePolicyOperationId?: string;
}

export interface SuperConsoleOptions {
  adapters: readonly AdminCapabilityAdapter[];
  enabledModules: readonly string[];
  auth: SuperConsoleOperatorAuth;
  audit?: AdminAuditSink;
  auditQuery?: SuperConsoleAuditQuery;
  idempotency?: AdminIdempotencyStore;
  policy?: AdminPolicyEvaluator;
  shellPolicy: SuperConsoleShellPolicy;
  confirmation?: SuperConsoleConfirmationService;
  search?: SuperConsoleSearchService;
  overview?: SuperConsoleOverviewService;
  settings?: SuperConsoleSettingsService;
  serverName?: string;
  apiBasePath?: string;
  /** Deployment/provider-owned OpenAPI authentication schemes. */
  openApiSecuritySchemes: Readonly<{
    operatorSession: unknown;
    operatorApiKey: unknown;
    [name: string]: unknown;
  }>;
  /** Exact provider-owned CSRF header projected for unsafe operations. */
  openApiCsrfHeader?: Readonly<{
    name: string;
    description?: string;
  }>;
  now?: () => Date;
}

export interface SuperConsoleConfirmationService extends AdminConfirmationVerifier {
  /** Stage an unusable token before its required terminal audit and activation. */
  issue(input: {
    operationId: string;
    input: unknown;
    principal: SuperConsolePrincipal;
    context: AdminOperationContext;
  }): Promise<{ token: string; expiresAt: string }>;
  /**
   * Durably bind the staged token to its terminal audit IDs while leaving it fail-closed.
   * A prepared record must never become verifiable from audit observation alone.
   */
  prepareActivation(input: {
    token: string;
    auditId: string;
    /** Bound failure audit whose existence permanently fences reconciliation. */
    denialAuditId: string;
    operationId: string;
    input: unknown;
    principal: SuperConsolePrincipal;
    context: AdminOperationContext;
  }): Promise<void>;
  /** Durably make cancellation take precedence over the prepared success audit. */
  cancelActivation(input: {
    token: string;
    auditId: string;
    denialAuditId: string;
    operationId: string;
    input: unknown;
    principal: SuperConsolePrincipal;
    context: AdminOperationContext;
  }): Promise<void>;
  /**
   * The only transition that may make a staged token verifiable. This operation must be
   * atomic and idempotent; rejection guarantees the token remains unusable and cannot
   * become active later through reconciliation.
   */
  activate(input: {
    token: string;
    auditId: string;
    operationId: string;
    input: unknown;
    principal: SuperConsolePrincipal;
    context: AdminOperationContext;
  }): Promise<void>;
  /** Idempotently discard a staged token and any prepared activation intent. */
  revoke(input: {
    token: string;
    operationId: string;
    input: unknown;
    principal: SuperConsolePrincipal;
    context: AdminOperationContext;
  }): Promise<void>;
}

export interface SuperConsoleRequestState {
  principal: SuperConsolePrincipal;
  context: AdminOperationContext;
}
