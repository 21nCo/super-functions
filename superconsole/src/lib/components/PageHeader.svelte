<script lang="ts">
  import { ButtonIcon, ButtonLabel, ButtonRoot } from '@uifn/components-svelte/button';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { safeConsoleNavigationHref, scopedConsoleHref } from './admin-api';
  import { shellSurfaceEnabled, type RegistryViewModel } from './view-models';
  import type { Snippet } from 'svelte';
  import ConsoleIcon from './ConsoleIcon.svelte';

  let {
    eyebrow,
    title,
    description,
    backHref,
    actions,
  }: {
    eyebrow?: string;
    title: string;
    description?: string;
    backHref?: string;
    actions?: Snippet;
  } = $props();

  const registry = $derived((page.data as { shell?: { registry?: RegistryViewModel } }).shell?.registry);
  const auditEnabled = $derived(registry ? shellSurfaceEnabled(registry, 'audit') : false);
</script>

<header class="page-header">
  <div class="page-header__copy">
    {#if backHref}
      <a class="page-header__back" href={scopedConsoleHref(safeConsoleNavigationHref(backHref, page.url.origin) ?? '/', page.url.searchParams)}>
        <ConsoleIcon name="arrow-left" size={15} />
        Back
      </a>
    {/if}
    {#if eyebrow}<p class="eyebrow">{eyebrow}</p>{/if}
    <h1>{title}</h1>
    {#if description}<p>{description}</p>{/if}
  </div>
  {#if actions}
    <div class="page-header__actions">{@render actions()}</div>
  {:else if !backHref && auditEnabled}
    <ButtonRoot variant="outline" size="sm" onclick={() => void goto(scopedConsoleHref('/audit', page.url.searchParams))}>
      <ButtonIcon><ConsoleIcon name="audit" /></ButtonIcon>
      <ButtonLabel>View audit trail</ButtonLabel>
    </ButtonRoot>
  {/if}
</header>
