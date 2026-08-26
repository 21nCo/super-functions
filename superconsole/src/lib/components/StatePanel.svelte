<script lang="ts">
  import { ButtonIcon, ButtonLabel, ButtonRoot } from '@uifn/components-svelte/button';
  import {
    CardContent,
    CardDescription,
    CardHeader,
    CardRoot,
    CardTitle,
  } from '@uifn/components-svelte/card';
  import { SkeletonRoot } from '@uifn/components-svelte/skeleton';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { safeConsoleNavigationHref, scopedConsoleHref } from './admin-api';
  import ConsoleIcon from './ConsoleIcon.svelte';
  import type { AdminErrorViewModel, AdminStateKind } from './view-models';

  let {
    kind,
    title,
    message,
    error,
    actionHref,
    actionLabel,
    onAction,
  }: {
    kind: Exclude<AdminStateKind, 'ready'>;
    title?: string;
    message?: string;
    error?: AdminErrorViewModel;
    actionHref?: string;
    actionLabel?: string;
    onAction?: () => void;
  } = $props();

  const copy = $derived.by(() => {
    if (kind === 'loading') return { title: title ?? 'Loading', message: message ?? 'Retrieving the latest operator data.' };
    if (kind === 'empty') return { title: title ?? 'Nothing here yet', message: message ?? 'There are no resources in this scope.' };
    if (kind === 'forbidden') return { title: title ?? 'Access restricted', message: message ?? 'Your operator role does not grant access to this surface.' };
    if (kind === 'not-found') return { title: title ?? 'Not found', message: message ?? 'This resource does not exist or is not enabled for this deployment.' };
    return { title: title ?? 'Unable to load this view', message: message ?? error?.message ?? 'The administration service returned an unexpected error.' };
  });
</script>

<CardRoot class={`state-panel state-panel--${kind}`} elevated={kind === 'error'}>
  <CardHeader>
    <div class="state-panel__icon" aria-hidden="true">
      <ConsoleIcon name={kind === 'forbidden' ? 'audit' : kind === 'not-found' ? 'search' : kind === 'empty' ? 'module' : kind === 'loading' ? 'activity' : 'bell'} size={22} />
    </div>
    <CardTitle>{copy.title}</CardTitle>
    <CardDescription>{copy.message}</CardDescription>
  </CardHeader>
  <CardContent>
    {#if kind === 'loading'}
      <div class="state-panel__skeletons" aria-label="Loading content">
        <SkeletonRoot style={{ height: '0.75rem', width: '78%' }} />
        <SkeletonRoot style={{ height: '0.75rem', width: '58%' }} />
        <SkeletonRoot style={{ height: '2.5rem', width: '100%' }} />
      </div>
    {:else}
      {#if error?.requestId}
        <p class="request-id">Request <code>{error.requestId}</code></p>
      {/if}
      {#if actionLabel && (actionHref || onAction)}
        <ButtonRoot onclick={() => {
          if (onAction) return onAction();
          const safeHref = safeConsoleNavigationHref(actionHref, page.url.origin);
          if (safeHref) void goto(scopedConsoleHref(safeHref, page.url.searchParams));
        }} variant="outline" size="sm">
          <ButtonLabel>{actionLabel}</ButtonLabel>
          <ButtonIcon><ConsoleIcon name="arrow-right" /></ButtonIcon>
        </ButtonRoot>
      {/if}
    {/if}
  </CardContent>
</CardRoot>
