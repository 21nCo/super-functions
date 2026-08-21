<script lang="ts">
  import { goto } from '$app/navigation';
  import { ButtonIcon, ButtonLabel, ButtonRoot } from '@uifn/components-svelte/button';
  import { InputRoot } from '@uifn/components-svelte/input';
  import {
    SelectContent,
    SelectItem,
    SelectItemIndicator,
    SelectItemText,
    SelectPositioner,
    SelectRoot,
    SelectTrigger,
    SelectValueText,
  } from '@uifn/components-svelte/select';
  import ActionButton from './ActionButton.svelte';
  import ConsoleIcon from './ConsoleIcon.svelte';
  import PageHeader from './PageHeader.svelte';
  import ResourceTable from './ResourceTable.svelte';
  import StatePanel from './StatePanel.svelte';
  import type { AdminErrorViewModel, ResourceListViewModel } from './view-models';

  let {
    view,
    loadError,
    initialQuery = '',
  }: { view?: ResourceListViewModel; loadError?: AdminErrorViewModel; initialQuery?: string } = $props();
  let query = $state('');
  let filterValues = $state<Record<string, string>>({});
  $effect(() => {
    query = initialQuery;
    filterValues = Object.fromEntries((view?.filters ?? []).map((filter) => [filter.field, filter.value]));
  });

  function applyControls() {
    const url = new URL(window.location.href);
    if (view?.searchEnabled && query.trim()) url.searchParams.set('q', query.trim());
    else url.searchParams.delete('q');
    for (const filter of view?.filters ?? []) {
      const value = filterValues[filter.field];
      if (value) url.searchParams.set(filter.field, value);
      else url.searchParams.delete(filter.field);
    }
    url.searchParams.delete('cursor');
    void goto(`${url.pathname}${url.search}`);
  }
</script>

{#if !view}
  <PageHeader eyebrow="Resource registry" title="Resource unavailable" backHref="/" />
  <StatePanel kind="not-found" error={loadError} actionHref="/" actionLabel="Return to overview" />
{:else}
  <PageHeader
    eyebrow={view.resource.sourceModuleId && view.resource.sourceModuleId !== view.module.id ? `${view.module.name} / ${view.resource.sourceModuleId}` : view.module.name}
    title={view.resource.pluralLabel ?? view.resource.label}
    description={view.resource.description}
    backHref={view.module.href}
  >
    {#snippet actions()}
      {#if view.resource.createAction}<ActionButton action={view.resource.createAction} />{/if}
    {/snippet}
  </PageHeader>

  {#if loadError?.status === 403}
    <StatePanel kind="forbidden" error={loadError} />
  {:else if loadError}
    <StatePanel kind="error" error={loadError} actionHref={view.resource.href} actionLabel="Retry" />
  {:else}
    <form class="resource-toolbar" onsubmit={(event) => { event.preventDefault(); applyControls(); }}>
      {#if view.searchEnabled}
        <div class="resource-toolbar__search">
          <ConsoleIcon name="search" />
          <InputRoot value={query} oninput={(event: Event) => (query = (event.currentTarget as HTMLInputElement).value)} name="q" placeholder={`Search ${view.resource.pluralLabel ?? view.resource.label.toLowerCase()}…`} aria-label="Search resources" />
        </div>
      {/if}
      {#each view.filters ?? [] as filter (filter.field)}
        <label class="resource-toolbar__filter">
          <span>{filter.label}</span>
          {#if filter.options?.length}
            <SelectRoot
              value={filterValues[filter.field] || '__all__'}
              onValueChange={(value: string | string[]) => {
                const selected = Array.isArray(value) ? value[0] : value;
                filterValues[filter.field] = selected === '__all__' ? '' : selected;
              }}
            >
              <SelectTrigger class="resource-toolbar__filter-trigger" aria-label={`Filter by ${filter.label.toLowerCase()}`}>
                <SelectValueText placeholder="All">{filterValues[filter.field] || 'All'}</SelectValueText>
                <ConsoleIcon name="chevron-down" size={14} />
              </SelectTrigger>
              <SelectPositioner>
                <SelectContent class="resource-toolbar__filter-content">
                  <SelectItem value="__all__" class="resource-toolbar__filter-item">
                    <SelectItemText>All</SelectItemText><SelectItemIndicator><ConsoleIcon name="check" size={14} /></SelectItemIndicator>
                  </SelectItem>
                  {#each filter.options as option (String(option))}
                    <SelectItem value={String(option)} class="resource-toolbar__filter-item">
                      <SelectItemText>{String(option)}</SelectItemText><SelectItemIndicator><ConsoleIcon name="check" size={14} /></SelectItemIndicator>
                    </SelectItem>
                  {/each}
                </SelectContent>
              </SelectPositioner>
            </SelectRoot>
          {:else}
            <InputRoot
              name={filter.field}
              value={filterValues[filter.field] ?? ''}
              oninput={(event: Event) => (filterValues[filter.field] = (event.currentTarget as HTMLInputElement).value)}
              aria-label={`Filter by ${filter.label.toLowerCase()}`}
            />
          {/if}
        </label>
      {/each}
      {#if view.searchEnabled || view.filters?.length}
        <ButtonRoot type="submit" variant="outline"><ButtonLabel>Apply</ButtonLabel></ButtonRoot>
      {/if}
      <span class="resource-toolbar__count">{view.total ?? view.rows.length} total</span>
    </form>

    <ResourceTable caption={`${view.resource.pluralLabel ?? view.resource.label} in the active operator scope.`} columns={view.columns} rows={view.rows} />

    {#if view.nextCursor}
      <div class="pagination-bar">
        <span>More resources are available.</span>
        <ButtonRoot variant="outline" onclick={() => {
          const url = new URL(window.location.href);
          url.searchParams.set('cursor', view!.nextCursor!);
          void goto(`${url.pathname}${url.search}`);
        }}>
          <ButtonLabel>Load next page</ButtonLabel><ButtonIcon><ConsoleIcon name="arrow-right" /></ButtonIcon>
        </ButtonRoot>
      </div>
    {/if}
  {/if}
{/if}
