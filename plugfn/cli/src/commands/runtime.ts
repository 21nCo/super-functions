import { createOutput } from '@clifn/core';
import { resolveRuntime, type DiagnosticDependencies } from './test.js';

export interface RuntimeCommandOptions {
  json?: boolean;
  provider?: string;
  userId?: string;
  connection?: string;
  resource?: string;
  receipt?: string;
}

export async function providersListCommand(
  options: RuntimeCommandOptions,
  dependencies: DiagnosticDependencies = {}
) {
  const { runtime } = await resolveRuntime(dependencies);
  const providers = runtime.providers.list
    ? runtime.providers.list()
    : [];
  writeOutput({ providers }, options, dependencies);
}

export async function providersInspectCommand(
  provider: string,
  options: RuntimeCommandOptions,
  dependencies: DiagnosticDependencies = {}
) {
  const { runtime } = await resolveRuntime(dependencies);
  const definition = runtime.providers.get(provider);
  if (!definition) {
    throw new Error(`provider ${provider} is not registered`);
  }
  writeOutput({ provider: definition }, options, dependencies);
}

export async function connectionsListCommand(
  options: RuntimeCommandOptions,
  dependencies: DiagnosticDependencies = {}
) {
  const userId = requireOption(options.userId, '--user-id');
  const { runtime } = await resolveRuntime(dependencies);
  const connections = await runtime.connections.list({
    userId,
    provider: options.provider,
  });
  writeOutput({ connections }, options, dependencies);
}

export async function syncBackfillCommand(
  options: RuntimeCommandOptions,
  dependencies: DiagnosticDependencies = {}
) {
  const provider = requireOption(options.provider, '--provider');
  const connectionId = requireOption(options.connection, '--connection');
  const resource = requireOption(options.resource, '--resource');
  const { runtime } = await resolveRuntime(dependencies);
  if (!runtime.sync?.backfill) {
    throw new Error('runtime does not expose plug.sync.backfill');
  }
  const job = await runtime.sync.backfill({
    provider,
    connectionId,
    resource,
    actor: options.userId ? { userId: options.userId } : undefined,
  });
  writeOutput({ job }, options, dependencies);
}

export async function webhooksReplayCommand(
  options: RuntimeCommandOptions,
  dependencies: DiagnosticDependencies = {}
) {
  const receiptId = requireOption(options.receipt, '--receipt');
  const { runtime } = await resolveRuntime(dependencies);
  const webhookRuntime = runtime.runtime?.webhooks;
  if (!webhookRuntime) {
    throw new Error('runtime does not expose webhook receipt storage');
  }
  const receipt = await webhookRuntime.getReceipt(receiptId);
  if (!receipt) {
    throw new Error(`webhook receipt ${receiptId} was not found`);
  }
  writeOutput(
    {
      receipt,
      deliveries: await webhookRuntime.listDeliveries(receiptId),
    },
    options,
    dependencies
  );
}

export async function doctorCommand(
  options: RuntimeCommandOptions,
  dependencies: DiagnosticDependencies = {}
) {
  const { runtime, configPath } = await resolveRuntime(dependencies);
  const providers = runtime.providers.list ? runtime.providers.list() : [];
  const configuredProviders = Object.keys(runtime.config.integrations ?? {});
  const checks = [
    {
      name: 'runtime',
      ok: true,
      message: `loaded runtime from ${configPath ?? 'injected runtime'}`,
    },
    {
      name: 'providers',
      ok: providers.length > 0,
      message: `${providers.length} registered provider(s)`,
    },
    {
      name: 'configuration',
      ok: configuredProviders.every((provider) => Boolean(runtime.providers.get(provider))),
      message: `${configuredProviders.length} configured provider(s) checked`,
    },
    {
      name: 'routes',
      ok: typeof runtime.connections?.list === 'function' && typeof runtime.webhooks?.handle === 'function',
      message: 'connection and webhook APIs are reachable',
    },
  ];
  writeOutput({ ok: checks.every((check) => check.ok), checks }, options, dependencies);
}

function writeOutput(
  value: unknown,
  options: RuntimeCommandOptions,
  dependencies: DiagnosticDependencies
) {
  const output = createOutput({
    mode: options.json ? 'json' : 'text',
    stdout: (text) => (dependencies.stdout ?? ((line: string) => console.log(line.trimEnd())))(text.trimEnd()),
    stderr: (text) => (dependencies.stderr ?? ((line: string) => console.error(line.trimEnd())))(text.trimEnd()),
  });
  if (options.json) {
    output.json(value);
    return;
  }
  output.info(formatHuman(value));
}

function formatHuman(value: unknown): string {
  if (value && typeof value === 'object' && 'providers' in value) {
    return (value as { providers: any[] }).providers
      .map((provider) => `${provider.name ?? provider.id} ${provider.version ?? ''}`.trim())
      .join('\n');
  }
  return JSON.stringify(value, null, 2);
}

function requireOption(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}
