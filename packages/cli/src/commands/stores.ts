import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../utils/config.js';
import type {
  ProvisionableStoreAdapter,
  RuntimeStores,
  StoreProvisioningPlan,
  StoreProvisioningResource,
} from '@superfunctions/db';

export interface GenerateStoreProvisioningOptions {
  config: string;
  output: string;
  force: boolean;
  dryRun: boolean;
}

interface NamedPlan extends StoreProvisioningPlan {
  source: string;
}

/** Generates provider-owned runtime store provisioning artifacts from configured stores. */
export async function generateStoreProvisioning(
  options: GenerateStoreProvisioningOptions,
): Promise<void> {
  console.log('🔨 Generating runtime store provisioning artifacts...\n');

  const config = await loadConfig(options.config);
  if (!config) {
    console.log('❌ No config found. Create one with: superfunctions init');
    process.exitCode = 1;
    return;
  }

  const plans = await collectProvisioningPlans(config.stores);
  if (plans.length === 0) {
    console.log('⚠️  No provisionable stores found in config.stores');
    console.log('   Stores can expose getProvisioningPlan() to participate.');
    return;
  }

  const outputDir = path.resolve(process.cwd(), options.output);
  const files = renderProvisioningFiles(plans);

  console.log(`✅ Found ${plans.length} provisioning plan(s)`);
  console.log(`   Output: ${options.output}\n`);

  if (options.dryRun) {
    for (const file of files) {
      console.log(`📄 ${path.join(options.output, file.name)}`);
      console.log(file.content);
      console.log('');
    }
    return;
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  for (const file of files) {
    const target = path.join(outputDir, file.name);
    if (fs.existsSync(target) && !options.force) {
      console.log(`⚠️  File exists: ${target}`);
      console.log('   Use --force to overwrite');
      continue;
    }
    fs.writeFileSync(target, file.content);
    console.log(`✅ Wrote ${path.relative(process.cwd(), target)}`);
  }
}

async function collectProvisioningPlans(
  stores: RuntimeStores | undefined,
): Promise<NamedPlan[]> {
  if (!stores) {
    return [];
  }
  const entries: Array<[string, unknown]> = [
    ['kv', stores.kv],
    ['atomicKv', stores.atomicKv],
    ['directory', stores.directory],
  ];
  const plans: NamedPlan[] = [];
  for (const [source, store] of entries) {
    if (!isProvisionableStore(store)) {
      continue;
    }
    const value = await Promise.resolve(store.getProvisioningPlan());
    const normalized = Array.isArray(value) ? value : [value];
    for (const plan of normalized) {
      plans.push({ ...plan, source });
    }
  }
  return dedupePlans(plans);
}

function isProvisionableStore(value: unknown): value is Required<ProvisionableStoreAdapter> {
  return Boolean(value)
    && typeof value === 'object'
    && typeof (value as ProvisionableStoreAdapter).getProvisioningPlan === 'function';
}

function dedupePlans(plans: NamedPlan[]): NamedPlan[] {
  const byKey = new Map<string, NamedPlan>();
  for (const plan of plans) {
    const key = plan.id ?? stableStringify({
      provider: plan.provider,
      resources: plan.resources,
    });
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        ...plan,
        resources: dedupeResources(plan.resources),
        notes: dedupeStrings(plan.notes ?? []),
      });
      continue;
    }
    byKey.set(key, {
      ...existing,
      source: dedupeStrings([existing.source, plan.source]).join(','),
      resources: dedupeResources([...existing.resources, ...plan.resources]),
      notes: dedupeStrings([...(existing.notes ?? []), ...(plan.notes ?? [])]),
    });
  }
  return Array.from(byKey.values());
}

function renderProvisioningFiles(plans: NamedPlan[]): Array<{ name: string; content: string }> {
  const files = [
    {
      name: 'stores.provisioning.json',
      content: `${JSON.stringify({ plans }, null, 2)}\n`,
    },
    {
      name: 'README.md',
      content: renderReadme(plans),
    },
  ];

  for (const plan of plans) {
    const base = safeFileName(plan.id ?? `${plan.provider}-${plan.source}`);
    if (plan.provider === 'dynamodb') {
      files.push({
        name: `${base}.dynamodb.json`,
        content: `${JSON.stringify({ resources: plan.resources }, null, 2)}\n`,
      });
      continue;
    }
    if (plan.provider === 'cloudflare-do') {
      files.push({
        name: `${base}.cloudflare.md`,
        content: renderCloudflareDurableObjectPlan(plan),
      });
      continue;
    }
    if (plan.provider === 'redis') {
      files.push({
        name: `${base}.redis.md`,
        content: renderRedisPlan(plan),
      });
      continue;
    }
    if (isSqlProvider(plan.provider)) {
      files.push({
        name: `${base}.${plan.provider}.sql`,
        content: renderSqlPlan(plan),
      });
    }
  }

  return files;
}

function renderReadme(plans: NamedPlan[]): string {
  const lines = [
    '# Superfunctions Runtime Store Provisioning',
    '',
    'These files are generated from `config.stores` and the store adapters in use.',
    '',
    '| Source | Provider | Resources |',
    '| --- | --- | ---: |',
    ...plans.map((plan) => `| ${plan.source} | ${plan.provider} | ${plan.resources.length} |`),
    '',
    'The Superfunction packages own logical keys and index names. Store adapters own provider-specific resource layouts.',
    '',
  ];
  for (const plan of plans) {
    lines.push(`## ${plan.id ?? `${plan.provider}:${plan.source}`}`, '');
    if (plan.notes?.length) {
      for (const note of plan.notes) {
        lines.push(`- ${note}`);
      }
      lines.push('');
    }
  }
  return `${lines.join('\n')}\n`;
}

function renderCloudflareDurableObjectPlan(plan: NamedPlan): string {
  const binding = plan.resources.find((resource) => resource.type === 'durable-object-binding');
  const classResource = plan.resources.find((resource) => resource.type === 'durable-object-class');
  const bindingName = typeof binding?.binding === 'string' ? binding.binding : binding?.name;
  const className = typeof classResource?.className === 'string'
    ? classResource.className
    : typeof binding?.className === 'string'
      ? binding.className
      : 'SuperfunctionsStoresDurableObject';
  return [
    '# Cloudflare Durable Object Store',
    '',
    'Export the Durable Object class from your Worker entrypoint:',
    '',
    '```ts',
    `export { ${className} } from '@superfunctions/db/adapters/cloudflare-do';`,
    '```',
    '',
    'Add a Durable Object binding to your Cloudflare configuration:',
    '',
    '```toml',
    '[[durable_objects.bindings]]',
    `name = "${bindingName ?? 'SUPERFUNCTIONS_STORES'}"`,
    `class_name = "${className}"`,
    '```',
    '',
    ...(plan.notes ?? []).map((note) => `- ${note}`),
    '',
  ].join('\n');
}

function renderRedisPlan(plan: NamedPlan): string {
  return [
    '# Redis/Valkey Runtime Store',
    '',
    'Redis-compatible stores do not require schema provisioning.',
    '',
    ...(plan.notes ?? []).map((note) => `- ${note}`),
    '',
  ].join('\n');
}

function renderSqlPlan(plan: NamedPlan): string {
  const statements: string[] = [];
  for (const resource of plan.resources) {
    if (resource.type === 'table') {
      statements.push(renderSqlTable(resource));
    }
    if (resource.type === 'index') {
      statements.push(renderSqlIndex(resource));
    }
  }
  return statements.length > 0
    ? `${statements.join('\n\n')}\n`
    : `-- No SQL resources declared for ${plan.id ?? plan.provider}\n`;
}

function renderSqlTable(resource: StoreProvisioningResource): string {
  const columns = Array.isArray(resource.columns)
    ? resource.columns as Array<Record<string, unknown>>
    : [];
  const lines = columns.map((column) => {
    const name = String(column.name);
    const type = String(column.type ?? 'text');
    const nullable = column.nullable === false ? ' NOT NULL' : '';
    const primaryKey = column.primaryKey === true ? ' PRIMARY KEY' : '';
    const defaultValue = typeof column.default === 'string' ? ` DEFAULT ${column.default}` : '';
    return `  ${quoteSqlIdentifier(name)} ${type}${nullable}${defaultValue}${primaryKey}`;
  });
  return [
    `CREATE TABLE IF NOT EXISTS ${quoteSqlIdentifier(resource.name)} (`,
    lines.join(',\n'),
    ');',
  ].join('\n');
}

function renderSqlIndex(resource: StoreProvisioningResource): string {
  const table = typeof resource.table === 'string' ? resource.table : '';
  const columns = Array.isArray(resource.columns) ? resource.columns.map(String) : [];
  const unique = resource.unique === true ? 'UNIQUE ' : '';
  return `CREATE ${unique}INDEX IF NOT EXISTS ${quoteSqlIdentifier(resource.name)} ON ${quoteSqlIdentifier(table)} (${columns.map(quoteSqlIdentifier).join(', ')});`;
}

function isSqlProvider(provider: string): boolean {
  return provider === 'postgres' || provider === 'mysql' || provider === 'sqlite';
}

function quoteSqlIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function dedupeResources(resources: StoreProvisioningResource[]): StoreProvisioningResource[] {
  return Array.from(new Map(resources.map((resource) => [stableStringify(resource), resource])).values());
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.length > 0)));
}

function safeFileName(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, sortValue(entry)]),
    );
  }
  return value;
}
