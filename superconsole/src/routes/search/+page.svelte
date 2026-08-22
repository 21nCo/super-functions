<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { ButtonIcon, ButtonLabel, ButtonRoot } from '@uifn/components-svelte/button';
  import { CardAction, CardContent, CardDescription, CardHeader, CardRoot, CardTitle } from '@uifn/components-svelte/card';
  import { InputRoot } from '@uifn/components-svelte/input';
  import ConsoleIcon from '$lib/components/ConsoleIcon.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import StatePanel from '$lib/components/StatePanel.svelte';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import { safeConsoleNavigationHref, scopedConsoleHref } from '$lib/components/admin-api';
  import { formatValue } from '$lib/components/view-models';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let query = $state('');
  $effect(() => { query = data.query; });

  function submit() {
    const trimmed = query.trim();
    void goto(scopedConsoleHref(trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : '/search', page.url.searchParams));
  }

  function openResult(href: string) {
    const safeHref = safeConsoleNavigationHref(href, page.url.origin);
    if (safeHref) void goto(scopedConsoleHref(safeHref, page.url.searchParams));
  }
</script>

<PageHeader eyebrow="Operator search" title="Global search" description="Find resources across only the modules enabled in the active operator scope." />

<form class="global-search" onsubmit={(event) => { event.preventDefault(); submit(); }}>
  <ConsoleIcon name="search" size={22} />
  <InputRoot value={query} oninput={(event: Event) => (query = (event.currentTarget as HTMLInputElement).value)} name="q" placeholder="Search users, runs, messages, deployments, files…" aria-label="Search all enabled modules" autofocus />
  <ButtonRoot type="submit"><ButtonLabel>Search</ButtonLabel></ButtonRoot>
</form>

{#if data.loadError?.status === 403}
  <StatePanel kind="forbidden" error={data.loadError} />
{:else if data.loadError}
  <StatePanel kind="error" error={data.loadError} />
{:else if !data.query}
  <StatePanel kind="empty" title="Search the active scope" message="Results are permission filtered and grouped by their owning Superfunction." />
{:else if data.results.length === 0}
  <StatePanel kind="empty" title={`No results for “${data.query}”`} message="Try a resource ID, operator-visible name, email, status, or module-specific term." />
{:else}
  <div class="search-results-heading"><strong>{data.total} results</strong><span>for “{data.query}”</span></div>
  <div class="search-results">
    {#each data.results as result (`${result.moduleId}-${result.id}`)}
      <CardRoot class="search-result">
        <CardHeader><StatusBadge label={result.moduleId} tone="info" /><CardTitle>{result.title}</CardTitle><CardDescription>{result.description ?? result.resource ?? 'Administration resource'}</CardDescription><CardAction>{#if result.status}<StatusBadge status={result.status} />{/if}</CardAction></CardHeader>
        <CardContent>{#if result.updatedAt}<span>Updated {formatValue(result.updatedAt, 'datetime')}</span>{/if}<ButtonRoot variant="ghost" size="sm" onclick={() => openResult(result.href)}><ButtonLabel>Open result</ButtonLabel><ButtonIcon><ConsoleIcon name="arrow-right" /></ButtonIcon></ButtonRoot></CardContent>
      </CardRoot>
    {/each}
  </div>
  {#if data.nextCursor}
    <div class="pagination-bar">
      <span>More search results are available.</span>
      <ButtonRoot variant="outline" onclick={() => {
        const url = new URL(window.location.href);
        url.searchParams.set('cursor', data.nextCursor!);
        void goto(`${url.pathname}${url.search}`);
      }}><ButtonLabel>Next page</ButtonLabel><ButtonIcon><ConsoleIcon name="arrow-right" /></ButtonIcon></ButtonRoot>
    </div>
  {/if}
{/if}
