<script lang="ts">
  import { goto } from '$app/navigation';
  import { ButtonIcon, ButtonLabel, ButtonRoot } from '@uifn/components-svelte/button';
  import { InputRoot } from '@uifn/components-svelte/input';
  import {
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRoot,
    TableRow,
    TableTable,
  } from '@uifn/components-svelte/table';
  import ConsoleIcon from '$lib/components/ConsoleIcon.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import StatePanel from '$lib/components/StatePanel.svelte';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import { formatValue } from '$lib/components/view-models';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let query = $state('');
  $effect(() => { query = data.query; });

  function applySearch() {
    const url = new URL(window.location.href);
    if (query.trim()) url.searchParams.set('q', query.trim());
    else url.searchParams.delete('q');
    url.searchParams.delete('cursor');
    void goto(`${url.pathname}${url.search}`);
  }
</script>

<PageHeader eyebrow="Operator audit" title="Audit trail" description="Immutable operator, REST, and MCP activity across every enabled module." />

{#if data.loadError?.status === 403}
  <StatePanel kind="forbidden" error={data.loadError} />
{:else}
  <form class="resource-toolbar" onsubmit={(event) => { event.preventDefault(); applySearch(); }}>
    <div class="resource-toolbar__search"><ConsoleIcon name="search" /><InputRoot value={query} oninput={(event: Event) => (query = (event.currentTarget as HTMLInputElement).value)} name="q" placeholder="Search actor, action, target, or request ID…" aria-label="Search audit events" /></div>
    <ButtonRoot type="submit" variant="outline"><ButtonLabel>Search audit</ButtonLabel></ButtonRoot>
    <span class="resource-toolbar__count">{data.total ?? data.events.length} events</span>
  </form>

  {#if data.loadError}
    <StatePanel kind="error" error={data.loadError} actionHref="/audit" actionLabel="Retry" />
  {:else if data.events.length === 0}
    <StatePanel kind="empty" title="No matching audit events" message="Mutating operator and MCP calls are recorded here with actor, scope, outcome, and request ID." />
  {:else}
    <TableRoot class="audit-table">
      <TableTable>
        <TableHeader><TableRow value="header"><TableHead value="time">Time</TableHead><TableHead value="actor">Actor</TableHead><TableHead value="action">Action</TableHead><TableHead value="target">Target</TableHead><TableHead value="outcome">Outcome</TableHead><TableHead value="request">Request</TableHead></TableRow></TableHeader>
        <TableBody>
          {#each data.events as event (event.id)}
            <TableRow value={event.id}>
              <TableCell value={`${event.id}-time`}>{formatValue(event.occurredAt, 'datetime')}</TableCell>
              <TableCell value={`${event.id}-actor`}><strong>{event.actor}</strong>{#if event.ipAddress}<span class="table-secondary">{event.ipAddress}</span>{/if}</TableCell>
              <TableCell value={`${event.id}-action`}>{event.action}{#if event.moduleId}<span class="table-secondary">{event.moduleId}</span>{/if}</TableCell>
              <TableCell value={`${event.id}-target`}><code>{event.target}</code></TableCell>
              <TableCell value={`${event.id}-outcome`}><StatusBadge status={event.outcome} /></TableCell>
              <TableCell value={`${event.id}-request`}><code>{event.requestId ?? '—'}</code></TableCell>
            </TableRow>
          {/each}
        </TableBody>
      </TableTable>
    </TableRoot>
  {/if}

  {#if data.nextCursor}<div class="pagination-bar"><span>More audit events are available.</span><ButtonRoot variant="outline" onclick={() => { const url = new URL(window.location.href); url.searchParams.set('cursor', data.nextCursor!); void goto(`${url.pathname}${url.search}`); }}><ButtonLabel>Next page</ButtonLabel><ButtonIcon><ConsoleIcon name="arrow-right" /></ButtonIcon></ButtonRoot></div>{/if}
{/if}
