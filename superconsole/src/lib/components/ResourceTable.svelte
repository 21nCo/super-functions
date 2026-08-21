<script lang="ts">
  import { ButtonIcon, ButtonLabel, ButtonRoot } from '@uifn/components-svelte/button';
  import {
    TableBody,
    TableCaption,
    TableCell,
    TableHead,
    TableHeader,
    TableRoot,
    TableRow,
    TableTable,
  } from '@uifn/components-svelte/table';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import ActionButton from './ActionButton.svelte';
  import ConsoleIcon from './ConsoleIcon.svelte';
  import StatePanel from './StatePanel.svelte';
  import StatusBadge from './StatusBadge.svelte';
  import { safeConsoleNavigationHref, scopedConsoleHref } from './admin-api';
  import { formatValue, type ResourceColumnViewModel, type ResourceRowViewModel } from './view-models';

  let {
    caption,
    columns,
    rows,
  }: {
    caption: string;
    columns: ResourceColumnViewModel[];
    rows: ResourceRowViewModel[];
  } = $props();

  function openRow(href: string) {
    const safeHref = safeConsoleNavigationHref(href, page.url.origin);
    if (safeHref) void goto(scopedConsoleHref(safeHref, page.url.searchParams));
  }
</script>

{#if rows.length === 0}
  <StatePanel kind="empty" title="No resources" message="No resources match the active scope and filters." />
{:else}
  <TableRoot class="resource-table">
    <TableTable>
      <TableCaption>{caption}</TableCaption>
      <TableHeader>
        <TableRow value="header">
          {#each columns as column (column.key)}
            <TableHead value={column.key}>{column.label}</TableHead>
          {/each}
          <TableHead value="actions"><span class="sr-only">Actions</span></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {#each rows as row (row.id)}
          <TableRow value={row.id}>
            {#each columns as column (column.key)}
              <TableCell value={`${row.id}-${column.key}`}>
                {#if column.format === 'status'}
                  <StatusBadge status={formatValue(row.values[column.key])} />
                {:else if column.format === 'code'}
                  <code>{formatValue(row.values[column.key])}</code>
                {:else}
                  {formatValue(row.values[column.key], column.format)}
                {/if}
              </TableCell>
            {/each}
            <TableCell value={`${row.id}-actions`}>
              <div class="resource-table__actions">
                {#each row.actions ?? [] as action (action.id)}
                  <ActionButton {action} compact />
                {/each}
                {#if row.href}
                  <ButtonRoot variant="ghost" size="sm" aria-label={`Open ${row.id}`} onclick={() => openRow(row.href!)}>
                    <ButtonLabel>Open</ButtonLabel>
                    <ButtonIcon><ConsoleIcon name="arrow-right" /></ButtonIcon>
                  </ButtonRoot>
                {/if}
              </div>
            </TableCell>
          </TableRow>
        {/each}
      </TableBody>
    </TableTable>
  </TableRoot>
{/if}
