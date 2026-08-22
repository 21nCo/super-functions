<script lang="ts">
  import { goto } from '$app/navigation';
  import { ButtonIcon, ButtonLabel, ButtonRoot } from '@uifn/components-svelte/button';
  import { CardContent, CardDescription, CardHeader, CardRoot, CardTitle } from '@uifn/components-svelte/card';
  import ActionButton from './ActionButton.svelte';
  import ConsoleIcon from './ConsoleIcon.svelte';
  import PageHeader from './PageHeader.svelte';
  import StatePanel from './StatePanel.svelte';
  import StatusBadge from './StatusBadge.svelte';
  import { formatValue, type AdminErrorViewModel, type ResourceDetailViewModel } from './view-models';

  let { view, loadError }: { view?: ResourceDetailViewModel; loadError?: AdminErrorViewModel } = $props();
</script>

{#if !view}
  <PageHeader eyebrow="Resource" title="Resource unavailable" backHref="/" />
  <StatePanel kind="not-found" error={loadError} actionHref="/" actionLabel="Return to overview" />
{:else}
  <PageHeader eyebrow={`${view.module.name} / ${view.resource.sourceModuleId ?? view.resource.label}`} title={view.title} description={view.subtitle} backHref={view.resource.href}>
    {#snippet actions()}
      {#each view.actions ?? [] as action (action.id)}<ActionButton {action} />{/each}
    {/snippet}
  </PageHeader>

  {#if loadError?.status === 403}
    <StatePanel kind="forbidden" error={loadError} />
  {:else if loadError}
    <StatePanel kind="error" error={loadError} />
  {:else}
    <div class="detail-grid">
      <CardRoot class="detail-card">
        <CardHeader><CardTitle>Properties</CardTitle><CardDescription>Current function-owned administration data.</CardDescription></CardHeader>
        <CardContent>
          <dl class="detail-list">
            {#if view.status}<div><dt>Status</dt><dd><StatusBadge status={view.status} /></dd></div>{/if}
            {#each view.fields as field, index (index)}
              <div><dt>{field.label}</dt><dd class:code-value={field.format === 'code'}>{formatValue(field.value, field.format)}</dd></div>
            {/each}
          </dl>
        </CardContent>
      </CardRoot>

      {#if view.related?.length}
        <CardRoot class="detail-card">
          <CardHeader><CardTitle>Related resources</CardTitle><CardDescription>Function-declared resources scoped to this record.</CardDescription></CardHeader>
          <CardContent class="related-resource-list">
            {#each view.related as related (related.resourceId)}
              <div>
                <span><strong>{related.label}</strong>{#if related.description}<small>{related.description}</small>{/if}</span>
                <ButtonRoot variant="outline" size="sm" onclick={() => void goto(related.href)}>
                  <ButtonLabel>Open</ButtonLabel><ButtonIcon><ConsoleIcon name="arrow-right" /></ButtonIcon>
                </ButtonRoot>
              </div>
            {/each}
          </CardContent>
        </CardRoot>
      {/if}

      <CardRoot class="detail-card">
        <CardHeader><CardTitle>Audit history</CardTitle><CardDescription>Operator and MCP activity for this resource.</CardDescription></CardHeader>
        <CardContent>
          {#if !view.audit?.length}
            <StatePanel kind="empty" title="No audited changes" message="No mutations have been recorded for this resource." />
          {:else}
            <ol class="audit-timeline">
              {#each view.audit as event (event.id)}
                <li><span class="audit-timeline__dot"></span><div><strong>{event.action}</strong><span>{event.actor} · {formatValue(event.occurredAt, 'datetime')}</span><code>{event.target}</code></div></li>
              {/each}
            </ol>
          {/if}
        </CardContent>
      </CardRoot>
    </div>
  {/if}
{/if}
