<script lang="ts">
  import { CardContent, CardDescription, CardHeader, CardRoot, CardTitle } from '@uifn/components-svelte/card';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import StatePanel from '$lib/components/StatePanel.svelte';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import { formatValue } from '$lib/components/view-models';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<PageHeader eyebrow="McpFn" title="MCP administration" description="Scoped, permission-checked tools generated from the same enabled module contracts as REST and Super Console." />

{#if data.loadError?.status === 403}
  <StatePanel kind="forbidden" error={data.loadError} />
{:else if data.loadError}
  <StatePanel kind="error" error={data.loadError} actionHref="/mcp" actionLabel="Retry" />
{:else if data.mcp}
  <div class="mcp-status">
    <StatusBadge status={data.mcp.enabled ? 'enabled' : 'disabled'} />
    <div><span>Server</span><strong>{data.mcp.serverName ?? 'Super Console'}</strong></div>
    <div><span>Transport</span><code>{data.mcp.transport ?? 'streamable-http'}</code></div>
    {#if data.mcp.endpoint}<div><span>Endpoint</span><code>{data.mcp.endpoint}</code></div>{/if}
  </div>

  <div class="mcp-grid">
    <section aria-labelledby="mcp-tools-heading">
      <div class="section-heading"><div><p class="eyebrow">Enabled capabilities</p><h2 id="mcp-tools-heading">Tools</h2></div><StatusBadge label={String(data.mcp.tools?.length ?? 0)} tone="neutral" /></div>
      {#if !data.mcp.tools?.length}<StatePanel kind="empty" title="No MCP tools enabled" message="Enable modules and grant the caller scoped capabilities to expose administration tools." />{:else}<div class="tool-list">{#each data.mcp.tools as tool (tool.name)}<CardRoot class="tool-card"><CardHeader><StatusBadge label={tool.mutation ? 'Mutation' : 'Read'} tone={tool.mutation ? 'warning' : 'info'} /><CardTitle>{tool.name}</CardTitle><CardDescription>{tool.description ?? 'Function-owned administration capability.'}</CardDescription></CardHeader><CardContent>{#if tool.moduleId}<span>{tool.moduleId}</span>{/if}{#if tool.permission}<code>{tool.permission}</code>{/if}</CardContent></CardRoot>{/each}</div>{/if}
    </section>

    <section aria-labelledby="mcp-clients-heading">
      <div class="section-heading"><div><p class="eyebrow">Authenticated callers</p><h2 id="mcp-clients-heading">Clients</h2></div></div>
      {#if !data.mcp.clients?.length}<StatePanel kind="empty" title="No active clients" message="Authenticated MCP client activity will appear here." />{:else}<div class="client-list">{#each data.mcp.clients as client (client.id)}<div><StatusBadge status={client.status ?? 'unknown'} /><span><strong>{client.name}</strong>{#if client.lastSeenAt}<small>Last seen {formatValue(client.lastSeenAt, 'datetime')}</small>{/if}</span></div>{/each}</div>{/if}
    </section>
  </div>
{/if}
