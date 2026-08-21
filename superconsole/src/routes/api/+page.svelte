<script lang="ts">
  import { ButtonIcon, ButtonLabel, ButtonRoot } from '@uifn/components-svelte/button';
  import { CardContent, CardDescription, CardHeader, CardRoot, CardTitle } from '@uifn/components-svelte/card';
  import ConsoleIcon from '$lib/components/ConsoleIcon.svelte';
  import { openSafeAdminDownload } from '$lib/components/admin-api';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import StatePanel from '$lib/components/StatePanel.svelte';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<PageHeader eyebrow="Language-neutral administration" title="Admin API" description="Versioned REST and OpenAPI contracts generated from the enabled function-owned administration capabilities.">
  {#snippet actions()}
    <ButtonRoot variant="outline" onclick={() => openSafeAdminDownload('/api/admin/v1/openapi.json')}><ButtonIcon><ConsoleIcon name="external" /></ButtonIcon><ButtonLabel>Open OpenAPI JSON</ButtonLabel></ButtonRoot>
  {/snippet}
</PageHeader>

{#if data.loadError?.status === 403}
  <StatePanel kind="forbidden" error={data.loadError} />
{:else if data.loadError}
  <StatePanel kind="error" error={data.loadError} actionHref="/api" actionLabel="Retry" />
{:else if data.spec}
  <div class="api-hero">
    <div><StatusBadge label={`OpenAPI ${data.spec.openapi ?? '3.x'}`} tone="success" /><h2>{data.spec.info?.title ?? 'Super Console Admin API'}</h2><p>{data.spec.info?.description ?? 'Administration operations for the enabled Superfunctions.'}</p></div>
    <div><span>Version</span><code>{data.spec.info?.version ?? 'v1'}</code><span>Operations</span><strong>{data.operations.length}</strong></div>
  </div>

  <section aria-labelledby="operations-heading">
    <div class="section-heading"><div><p class="eyebrow">REST surface</p><h2 id="operations-heading">Operations</h2></div><StatusBadge label={`${data.operations.length} enabled`} tone="neutral" /></div>
    {#if data.operations.length === 0}
      <StatePanel kind="empty" title="No API operations" message="The enabled modules do not expose administration operations." />
    {:else}
      <div class="operation-list">
        {#each data.operations as operation (`${operation.method}-${operation.path}`)}
          <CardRoot class="operation-card">
            <CardHeader><StatusBadge label={operation.method} tone={operation.method === 'GET' ? 'info' : operation.method === 'DELETE' ? 'danger' : 'warning'} /><CardTitle>{operation.summary ?? operation.operationId ?? operation.path}</CardTitle><CardDescription>{operation.tags?.join(' · ') ?? 'Administration'}</CardDescription></CardHeader>
            <CardContent><code>{operation.path}</code>{#if operation.operationId}<span>{operation.operationId}</span>{/if}</CardContent>
          </CardRoot>
        {/each}
      </div>
    {/if}
  </section>
{/if}
