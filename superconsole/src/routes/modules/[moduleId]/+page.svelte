<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { ButtonIcon, ButtonLabel, ButtonRoot } from '@uifn/components-svelte/button';
  import { CardContent, CardDescription, CardFooter, CardHeader, CardRoot, CardTitle } from '@uifn/components-svelte/card';
  import ActionButton from '$lib/components/ActionButton.svelte';
  import ConsoleIcon from '$lib/components/ConsoleIcon.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import StatePanel from '$lib/components/StatePanel.svelte';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import { safeConsoleNavigationHref, scopedConsoleHref } from '$lib/components/admin-api';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const browseableResources = $derived((data.module?.resources ?? []).filter((resource) =>
    resource.listable !== false && resource.standaloneList !== false));

  function openResource(href: string) {
    const safeHref = safeConsoleNavigationHref(href, page.url.origin);
    if (safeHref) void goto(scopedConsoleHref(safeHref, page.url.searchParams));
  }
</script>

{#if !data.module}
  <PageHeader eyebrow="Module registry" title="Module unavailable" description="Only deploy-time enabled Superfunctions are exposed in the operator console." />
  <StatePanel kind="not-found" error={data.loadError} actionHref="/" actionLabel="Return to overview" />
{:else}
  <PageHeader eyebrow={data.module.group ?? 'Superfunction'} title={data.module.name} description={data.module.description}>
    {#snippet actions()}
      {#each data.module.actions ?? [] as action (action.id)}
        <div class="module-action">
          {#if action.sourceModuleId && action.sourceModuleId !== data.module.id}<StatusBadge label={action.sourceModuleId} tone="info" />{/if}
          <ActionButton {action} />
        </div>
      {/each}
    {/snippet}
  </PageHeader>

  {#if data.loadError?.status === 403}
    <StatePanel kind="forbidden" error={data.loadError} />
  {:else if data.loadError}
    <StatePanel kind="error" error={data.loadError} />
  {:else}
    <div class="module-status-bar">
      <StatusBadge status={data.module.health ?? 'unknown'} label={data.module.healthLabel ?? data.module.health ?? 'Unknown'} />
      {#if data.module.version}<span>Version <code>{data.module.version}</code></span>{/if}
      <span>{browseableResources.length} resource types</span>
      <span>{data.module.capabilities?.length ?? 0} admin capabilities</span>
    </div>

    {#if data.notices.length}
      <div class="notice-stack">
        {#each data.notices as notice (notice.id)}
          <div class={`notice notice--${notice.tone ?? 'info'}`} role="status">
            <StatusBadge status={notice.tone ?? 'info'} />
            <div><strong>{notice.title}</strong><span>{notice.message}</span></div>
          </div>
        {/each}
      </div>
    {/if}

    {#if data.summary.length}
      <section class="summary-strip" aria-label={`${data.module.name} summary`}>
        {#each data.summary as item (item.id)}
          <div><span>{item.label}</span><strong>{item.value}</strong>{#if item.detail}<small>{item.detail}</small>{/if}</div>
        {/each}
      </section>
    {/if}

    <section aria-labelledby="module-resources-heading">
      <div class="section-heading">
        <div><p class="eyebrow">Administration</p><h2 id="module-resources-heading">Resources</h2></div>
      </div>
      {#if !browseableResources.length}
        <StatePanel kind="empty" title="No browsable resources" message={`${data.module.name} exposes actions or status only in this deployment.`} />
      {:else}
        <div class="resource-card-grid">
          {#each browseableResources as resource (resource.href)}
            <CardRoot class="resource-card">
              <CardHeader>
                <div class="resource-card__icon"><ConsoleIcon name="module" size={20} /></div>
                <CardTitle>{resource.pluralLabel ?? resource.label}</CardTitle>
                <CardDescription>{resource.description ?? `Manage ${resource.pluralLabel ?? resource.label.toLowerCase()}.`}</CardDescription>
              </CardHeader>
              <CardContent>
                {#if resource.sourceModuleId && resource.sourceModuleId !== data.module.id}<StatusBadge label={`From ${resource.sourceModuleId}`} tone="info" />{/if}
                {#if resource.count !== undefined}<strong class="resource-card__count">{resource.count.toLocaleString()}</strong><span> in active scope</span>{/if}
              </CardContent>
              <CardFooter>
                <ButtonRoot variant="ghost" size="sm" onclick={() => openResource(resource.href)}>
                  <ButtonLabel>Open {resource.pluralLabel ?? resource.label}</ButtonLabel>
                  <ButtonIcon><ConsoleIcon name="arrow-right" /></ButtonIcon>
                </ButtonRoot>
              </CardFooter>
            </CardRoot>
          {/each}
        </div>
      {/if}
    </section>

    {#if data.module.capabilities?.length}
      <section class="capability-section" aria-labelledby="capabilities-heading">
        <div class="section-heading"><div><p class="eyebrow">Function-owned contract</p><h2 id="capabilities-heading">Capabilities</h2></div></div>
        <ul class="capability-list">
          {#each data.module.capabilities as capability (capability)}
            <li><ConsoleIcon name="check" size={15} /><code>{capability}</code></li>
          {/each}
        </ul>
      </section>
    {/if}
  {/if}
{/if}
