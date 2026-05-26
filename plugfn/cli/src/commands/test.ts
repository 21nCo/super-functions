import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfigFile } from '../utils/load-config-file.js';

export interface TestCommandOptions {
  provider?: string;
  userId?: string;
  action?: string;
  connectionId?: string;
  paramsFile?: string;
  webhookFixture?: string;
  json?: boolean;
  live?: boolean;
}

export interface DiagnosticCheckResult {
  name: 'runtime' | 'provider' | 'connection' | 'action' | 'oauth' | 'webhook';
  ok: boolean;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface DiagnosticReport {
  ok: boolean;
  status: 'pass' | 'fail';
  exitCode: 0 | 1 | 2 | 3;
  provider?: string;
  action?: string;
  connectionId?: string;
  checks: {
    runtime: boolean;
    provider: boolean;
    connection: boolean;
    action: boolean;
    oauth?: boolean;
    webhook?: boolean;
  };
  checkResults: DiagnosticCheckResult[];
  error?: {
    code: string;
    message: string;
  };
  metadata: {
    userId?: string;
    paramsFile?: string;
    webhookFixture?: string;
    configPath?: string;
    liveCheckRequested: boolean;
    timestamp: string;
  };
}

interface RuntimeConnection {
  id: string;
  provider?: string;
}

export interface DiagnosticRuntime {
  config: {
    baseUrl: string;
    integrations: Record<string, Record<string, unknown>>;
  };
  connections: {
    list(input: { userId: string; provider?: string }): Promise<RuntimeConnection[]>;
    getAuthUrl(input: {
      userId: string;
      provider: string;
      redirectUri: string;
      scopes?: string[];
      connectionName?: string;
    }): Promise<string>;
  };
  webhooks: {
    handle(
      provider: string,
      event: string,
      payload: unknown,
      headers: Record<string, string>,
      secret?: string,
      options?: { rawBody?: Uint8Array }
    ): Promise<unknown>;
  };
  providers: {
    get(name: string): unknown;
    list?(): any[];
  };
  sync?: {
    backfill(input: {
      provider: string;
      connectionId: string;
      resource: string;
      actor?: { userId: string };
    }): Promise<unknown>;
  };
  runtime?: {
    webhooks?: {
      getReceipt(id: string): Promise<unknown>;
      listDeliveries(receiptId: string): Promise<unknown[]>;
    };
  };
  [provider: string]: unknown;
}

export interface DiagnosticDependencies {
  runtime?: DiagnosticRuntime;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
  setExitCode?: (code: number) => void;
  readFile?: (path: string, encoding: BufferEncoding) => string;
  exists?: (path: string) => boolean;
  loadConfig?: (configPath: string) => Promise<unknown>;
}

class DiagnosticCommandError extends Error {
  readonly code:
    | 'VALIDATION_ERROR'
    | 'CLI_RUNTIME_LOAD_FAILED'
    | 'CLI_PROVIDER_CHECK_FAILED'
    | 'CLI_WEBHOOK_DIAGNOSTIC_FAILED';
  readonly exitCode: 1 | 2 | 3;

  constructor(
    code:
      | 'VALIDATION_ERROR'
      | 'CLI_RUNTIME_LOAD_FAILED'
      | 'CLI_PROVIDER_CHECK_FAILED'
      | 'CLI_WEBHOOK_DIAGNOSTIC_FAILED',
    message: string,
    exitCode: 1 | 2 | 3
  ) {
    super(message);
    this.name = 'DiagnosticCommandError';
    this.code = code;
    this.exitCode = exitCode;
  }
}

const DEFAULT_CONFIG_FILES = [
  'plugfn.config.ts',
  'plugfn.config.js',
  'plugfn.config.mjs',
  'plugfn.config.cjs',
] as const;

export async function runProviderDiagnostics(
  options: TestCommandOptions,
  dependencies: DiagnosticDependencies = {}
): Promise<DiagnosticReport> {
  const now = dependencies.now ?? (() => new Date());
  const metadata: DiagnosticReport['metadata'] = {
    userId: options.userId,
    paramsFile: options.paramsFile,
    webhookFixture: options.webhookFixture,
    liveCheckRequested: options.live === true,
    timestamp: now().toISOString(),
  };
  const provider = normalizeProvider(options.provider);
  const action = normalizeValue(options.action);
  const userId = normalizeValue(options.userId);
  const requestedConnectionId = normalizeValue(options.connectionId);

  try {
    if (!provider) {
      throw new DiagnosticCommandError(
        'VALIDATION_ERROR',
        'provider is required (--provider <provider-id>)',
        1
      );
    }

    if (!userId) {
      throw new DiagnosticCommandError(
        'VALIDATION_ERROR',
        'userId is required (--user-id <user-id>)',
        1
      );
    }

    if (!action) {
      throw new DiagnosticCommandError(
        'VALIDATION_ERROR',
        'action is required (--action <action-id>)',
        1
      );
    }

    const runtimeResolution = await resolveRuntime(dependencies);
    metadata.configPath = runtimeResolution.configPath;
    const runtime = runtimeResolution.runtime;

    const checkResults: DiagnosticCheckResult[] = [
      {
        name: 'runtime',
        ok: true,
        code: 'CLI_RUNTIME_READY',
        message: `loaded runtime from ${runtimeResolution.configPath ?? 'injected runtime'}`,
      },
    ];

    const providerConfig = runtime.config?.integrations?.[provider];
    const providerApi = runtime.providers?.get(provider);
    if (!providerConfig || !providerApi) {
      throw new DiagnosticCommandError(
        'CLI_PROVIDER_CHECK_FAILED',
        `provider ${provider} is not configured and registered in the runtime`,
        2
      );
    }
    checkResults.push({
      name: 'provider',
      ok: true,
      code: 'CLI_PROVIDER_READY',
      message: `provider ${provider} is configured and registered`,
    });

    const connections = await runtime.connections.list({
      userId,
      provider,
    });
    const resolvedConnection =
      requestedConnectionId !== undefined
        ? connections.find((connection) => connection.id === requestedConnectionId)
        : connections[0];
    if (!resolvedConnection) {
      throw new DiagnosticCommandError(
        'CLI_PROVIDER_CHECK_FAILED',
        `no connection resolved for provider ${provider} and user ${userId}`,
        2
      );
    }
    checkResults.push({
      name: 'connection',
      ok: true,
      code: 'CLI_CONNECTION_RESOLVED',
      message: `resolved connection ${resolvedConnection.id}`,
      details: {
        connectionId: resolvedConnection.id,
      },
    });

    const params = loadJsonFile(options.paramsFile, dependencies, {}) as Record<string, unknown>;
    const providerNamespace = runtime[provider] as Record<string, unknown> | undefined;
    const actionFn = providerNamespace?.[action];
    if (typeof actionFn !== 'function') {
      throw new DiagnosticCommandError(
        'CLI_PROVIDER_CHECK_FAILED',
        `provider action ${provider}.${action} is not available`,
        2
      );
    }

    await actionFn({
      userId,
      connectionId: resolvedConnection.id,
      params,
    });
    checkResults.push({
      name: 'action',
      ok: true,
      code: 'CLI_ACTION_EXECUTED',
      message: `provider action ${provider}.${action} executed successfully`,
    });

    let oauthCheck: DiagnosticCheckResult | undefined;
    if (isOAuthProviderConfig(providerConfig)) {
      const redirectUri = resolveRedirectUri(runtime, providerConfig);
      await runtime.connections.getAuthUrl({
        userId,
        provider,
        redirectUri,
        scopes: normalizeScopes(providerConfig.scopes),
      });
      oauthCheck = {
        name: 'oauth',
        ok: true,
        code: 'CLI_OAUTH_DIAGNOSTIC_PASSED',
        message: `oauth diagnostic succeeded using redirectUri ${redirectUri}`,
      };
      checkResults.push(oauthCheck);
    }

    let webhookCheck: DiagnosticCheckResult | undefined;
    if (options.webhookFixture) {
      const fixture = loadJsonFile(
        options.webhookFixture,
        dependencies,
        undefined
      ) as WebhookFixture | undefined;
      if (!fixture || typeof fixture !== 'object') {
        throw new DiagnosticCommandError(
          'VALIDATION_ERROR',
          'webhook fixture must be a JSON object',
          1
        );
      }

      const event = normalizeValue(fixture.event);
      if (!event) {
        throw new DiagnosticCommandError(
          'VALIDATION_ERROR',
          'webhook fixture must include an event field',
          1
        );
      }

      const rawBody =
        typeof fixture.rawBody === 'string'
          ? new TextEncoder().encode(fixture.rawBody)
          : fixture.payload !== undefined
            ? new TextEncoder().encode(JSON.stringify(fixture.payload))
            : new Uint8Array();
      const providerWebhookSecret =
        typeof providerConfig.webhookSecret === 'string' ? providerConfig.webhookSecret : undefined;
      const secret = normalizeValue(fixture.secret) ?? normalizeValue(providerWebhookSecret);

      try {
        await runtime.webhooks.handle(
          provider,
          event,
          fixture.payload,
          normalizeHeadersRecord(fixture.headers),
          secret,
          { rawBody }
        );
      } catch (error) {
        throw new DiagnosticCommandError(
          'CLI_WEBHOOK_DIAGNOSTIC_FAILED',
          `webhook diagnostic failed: ${(error as Error).message}`,
          3
        );
      }

      webhookCheck = {
        name: 'webhook',
        ok: true,
        code: 'CLI_WEBHOOK_DIAGNOSTIC_PASSED',
        message: `webhook diagnostic succeeded for ${provider}.${event}`,
      };
      checkResults.push(webhookCheck);
    }

    return {
      ok: true,
      status: 'pass',
      exitCode: 0,
      provider,
      action,
      connectionId: resolvedConnection.id,
      checks: {
        runtime: true,
        provider: true,
        connection: true,
        action: true,
        oauth: oauthCheck?.ok,
        webhook: webhookCheck?.ok,
      },
      checkResults,
      metadata,
    };
  } catch (error) {
    const diagnosticError =
      error instanceof DiagnosticCommandError
        ? error
        : new DiagnosticCommandError(
            'CLI_RUNTIME_LOAD_FAILED',
            (error as Error).message,
            1
          );
    const failedCheck = mapErrorToCheck(diagnosticError);
    return {
      ok: false,
      status: 'fail',
      exitCode: diagnosticError.exitCode,
      provider,
      action,
      checks: {
        runtime: failedCheck.name !== 'runtime' ? true : false,
        provider: failedCheck.name !== 'provider' && failedCheck.name !== 'runtime' ? true : false,
        connection: false,
        action: false,
        oauth: undefined,
        webhook: failedCheck.name === 'webhook' ? false : undefined,
      },
      checkResults: [failedCheck],
      error: {
        code: diagnosticError.code,
        message: diagnosticError.message,
      },
      metadata,
    };
  }
}

export function formatDiagnosticReport(report: DiagnosticReport, asJson: boolean): string {
  if (asJson) {
    return JSON.stringify(report, null, 2);
  }

  const lines: string[] = [];
  lines.push(`Provider diagnostics for ${report.provider ?? 'unknown'}`);
  lines.push('');

  for (const check of report.checkResults) {
    lines.push(`${check.ok ? 'PASS' : 'FAIL'} ${check.name}: ${check.message} (${check.code})`);
  }

  lines.push('');
  lines.push(`Overall: ${report.ok ? 'PASS' : 'FAIL'} (exit ${report.exitCode})`);

  if (report.error) {
    lines.push(`Error: ${report.error.code} - ${report.error.message}`);
  }

  return lines.join('\n');
}

export async function testCommand(
  options: TestCommandOptions,
  dependencies: DiagnosticDependencies = {}
) {
  const stdout = dependencies.stdout ?? ((line: string) => console.log(line));
  const stderr = dependencies.stderr ?? ((line: string) => console.error(line));
  const setExitCode = dependencies.setExitCode ?? ((code: number) => {
    process.exitCode = code;
  });

  const report = await runProviderDiagnostics(options, dependencies);
  const output = formatDiagnosticReport(report, options.json === true);

  if (report.ok || options.json === true) {
    stdout(output);
  } else {
    stderr(output);
  }

  setExitCode(report.exitCode);
}

interface WebhookFixture {
  event?: string;
  payload?: unknown;
  headers?: Record<string, unknown>;
  secret?: string;
  rawBody?: string;
}

export async function resolveRuntime(
  dependencies: DiagnosticDependencies
): Promise<{ runtime: DiagnosticRuntime; configPath?: string }> {
  if (dependencies.runtime) {
    return {
      runtime: dependencies.runtime,
      configPath: undefined,
    };
  }

  const cwd = dependencies.cwd ?? process.cwd();
  const configPath = findConfigPath(cwd, dependencies.exists ?? existsSync);
  if (!configPath) {
    throw new DiagnosticCommandError(
      'CLI_RUNTIME_LOAD_FAILED',
      'plugfn.config.{ts,js,mjs,cjs} not found in the current workspace',
      1
    );
  }

  const loadConfig = dependencies.loadConfig ?? loadConfigFile;
  const loaded = await loadConfig(configPath);
  const runtime = normalizeRuntime(loaded);
  if (!runtime) {
    throw new DiagnosticCommandError(
      'CLI_RUNTIME_LOAD_FAILED',
      'config file did not export a usable PlugFn runtime',
      1
    );
  }

  return {
    runtime,
    configPath,
  };
}

function findConfigPath(
  cwd: string,
  exists: (path: string) => boolean
): string | undefined {
  for (const filename of DEFAULT_CONFIG_FILES) {
    const candidate = resolve(cwd, filename);
    if (exists(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

function normalizeRuntime(value: unknown): DiagnosticRuntime | null {
  const candidate =
    value && typeof value === 'object' && 'plug' in (value as Record<string, unknown>)
      ? (value as { plug?: unknown }).plug
      : value;

  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  const runtime = candidate as DiagnosticRuntime;
  if (
    !runtime.config ||
    typeof runtime.config.baseUrl !== 'string' ||
    !runtime.connections ||
    typeof runtime.connections.list !== 'function' ||
    typeof runtime.connections.getAuthUrl !== 'function' ||
    !runtime.providers ||
    typeof runtime.providers.get !== 'function'
  ) {
    return null;
  }

  return runtime;
}

function mapErrorToCheck(error: DiagnosticCommandError): DiagnosticCheckResult {
  switch (error.code) {
    case 'VALIDATION_ERROR':
      return {
        name: 'runtime',
        ok: false,
        code: error.code,
        message: error.message,
      };
    case 'CLI_WEBHOOK_DIAGNOSTIC_FAILED':
      return {
        name: 'webhook',
        ok: false,
        code: error.code,
        message: error.message,
      };
    case 'CLI_PROVIDER_CHECK_FAILED':
      return {
        name: 'connection',
        ok: false,
        code: error.code,
        message: error.message,
      };
    case 'CLI_RUNTIME_LOAD_FAILED':
    default:
      return {
        name: 'runtime',
        ok: false,
        code: error.code,
        message: error.message,
      };
  }
}

function loadJsonFile(
  path: string | undefined,
  dependencies: DiagnosticDependencies,
  fallback: unknown
): unknown {
  if (!path) {
    return fallback;
  }

  const readFile = dependencies.readFile ?? readFileSync;
  const exists = dependencies.exists ?? existsSync;
  const resolvedPath = resolve(dependencies.cwd ?? process.cwd(), path);
  if (!exists(resolvedPath)) {
    throw new DiagnosticCommandError(
      'VALIDATION_ERROR',
      `file not found: ${path}`,
      1
    );
  }

  try {
    return JSON.parse(readFile(resolvedPath, 'utf8'));
  } catch (error) {
    throw new DiagnosticCommandError(
      'VALIDATION_ERROR',
      `failed to parse JSON file ${path}: ${(error as Error).message}`,
      1
    );
  }
}

function resolveRedirectUri(
  runtime: DiagnosticRuntime,
  providerConfig: Record<string, unknown>
): string {
  if (Array.isArray(providerConfig.redirectUris)) {
    const configured = providerConfig.redirectUris.find((value): value is string => {
      return typeof value === 'string' && value.length > 0;
    });
    if (configured) {
      return configured;
    }
  }

  return `${runtime.config.baseUrl.replace(/\/+$/, '')}/api/plugfn/callback`;
}

function normalizeScopes(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const scopes = value.filter((entry): entry is string => {
    return typeof entry === 'string' && entry.length > 0;
  });
  return scopes.length > 0 ? scopes : undefined;
}

function normalizeHeadersRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const result: Record<string, string> = {};
  for (const [key, current] of Object.entries(value as Record<string, unknown>)) {
    if (typeof current === 'string') {
      result[key] = current;
    }
  }
  return result;
}

function isOAuthProviderConfig(config: Record<string, unknown>): boolean {
  const type = typeof config.type === 'string' ? config.type : 'oauth2';
  return type === 'oauth2';
}

function normalizeProvider(provider: string | undefined): string | undefined {
  if (typeof provider !== 'string') {
    return undefined;
  }

  const value = provider.trim().toLowerCase();
  return value.length > 0 ? value : undefined;
}

function normalizeValue(value: string | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
