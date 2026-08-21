<script lang="ts">
  import { navigating, page } from '$app/state';
  import { beforeNavigate } from '$app/navigation';
  import { goto, invalidateAll } from '$app/navigation';
  import { BadgeRoot } from '@uifn/components-svelte/badge';
  import { ButtonIcon, ButtonLabel, ButtonRoot } from '@uifn/components-svelte/button';
  import {
    DrawerBackdrop,
    DrawerClose,
    DrawerContent,
    DrawerDescription,
    DrawerPortal,
    DrawerPositioner,
    DrawerRoot,
    DrawerTitle,
    DrawerTrigger,
  } from '@uifn/components-svelte/drawer';
  import { mountTheme, type FirstPartyThemeName } from '@uifn/theme';
  import { onMount, type Snippet } from 'svelte';
  import CommandPalette from './CommandPalette.svelte';
  import { fetchConsole, safeConsoleNavigationHref, scopedConsoleHref, setOperatorCsrf } from './admin-api';
  import ConsoleIcon from './ConsoleIcon.svelte';
  import ContextSwitcher from './ContextSwitcher.svelte';
  import OperatorNavigation from './OperatorNavigation.svelte';
  import StatusBadge from './StatusBadge.svelte';
  import { clearMutationFeedback, mutationFeedback } from './mutation-outcome';
  import {
    enabledNavigationModules,
    shellSurfaceEnabled,
    type ShellViewModel,
  } from './view-models';

  let {
    shell,
    children,
  }: { shell: ShellViewModel; children: Snippet } = $props();

  let mobileNavigationOpen = $state(false);
  let commandPaletteOpen = $state(false);
  let theme = $state<FirstPartyThemeName>('uifn-light');
  const modules = $derived(enabledNavigationModules(shell.registry));
  const overviewEnabled = $derived(shellSurfaceEnabled(shell.registry, 'overview'));
  const searchEnabled = $derived(shellSurfaceEnabled(shell.registry, 'search'));
  const apiEnabled = $derived(shellSurfaceEnabled(shell.registry, 'api'));
  const mcpEnabled = $derived(shellSurfaceEnabled(shell.registry, 'mcp'));
  const auditEnabled = $derived(shellSurfaceEnabled(shell.registry, 'audit'));
  const settingsEnabled = $derived(shellSurfaceEnabled(shell.registry, 'settings'));
  const homeHref = $derived(
    overviewEnabled
      ? '/'
      : modules[0]?.href
        ?? (auditEnabled ? '/audit' : settingsEnabled ? '/settings' : apiEnabled ? '/api' : mcpEnabled ? '/mcp' : '/')
  );
  $effect(() => setOperatorCsrf(shell.session?.csrfCookieName, shell.session?.csrfHeaderName));
  $effect(() => {
    if (!shell.session) clearMutationFeedback();
  });

  beforeNavigate(({ to, cancel }) => {
    if (!to || to.url.origin !== page.url.origin) return;
    const scoped = scopedConsoleHref(`${to.url.pathname}${to.url.search}${to.url.hash}`, page.url.searchParams);
    if (`${to.url.pathname}${to.url.search}${to.url.hash}` === scoped) return;
    cancel();
    void goto(scoped);
  });

  function navigate(href: string) {
    mobileNavigationOpen = false;
    const safeHref = safeConsoleNavigationHref(href, page.url.origin);
    if (safeHref) void goto(scopedConsoleHref(safeHref, page.url.searchParams));
  }

  function toggleTheme() {
    theme = theme === 'uifn-dark' ? 'uifn-light' : 'uifn-dark';
    localStorage.setItem('superconsole-theme', theme);
    mountTheme(theme, { root: document.documentElement });
  }

  async function signOut() {
    const response = await fetchConsole('/api/admin/v1/auth/sign-out', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: '{}',
    });
    if (response.ok) {
      clearMutationFeedback();
      setOperatorCsrf(undefined, undefined);
      await invalidateAll().catch(() => undefined);
      await goto('/sign-in');
    }
  }

  onMount(() => {
    const stored = localStorage.getItem('superconsole-theme');
    const preferred = window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'uifn-dark'
      : 'uifn-light';
    theme = stored === 'uifn-dark' || stored === 'uifn-light' ? stored : preferred;
    const mounted = mountTheme(theme, { root: document.documentElement });
    return () => mounted.unmount();
  });
</script>

<svelte:head>
  <title>Super Console</title>
  <meta name="description" content="Self-hosted administration for enabled Superfunctions" />
</svelte:head>

<DrawerRoot open={mobileNavigationOpen} onOpenChange={(open: boolean) => (mobileNavigationOpen = open)} side="left">
  <div class="operator-shell">
    <a class="skip-link" href="#operator-main">Skip to content</a>

    <aside class="operator-sidebar operator-sidebar--desktop" aria-label="Super Console navigation">
      <OperatorNavigation
        {shell}
        {modules}
        {homeHref}
        {overviewEnabled}
        {searchEnabled}
        {apiEnabled}
        {mcpEnabled}
        {auditEnabled}
        {settingsEnabled}
        onNavigate={navigate}
        onSignOut={() => void signOut()}
      />
    </aside>

  <div class="operator-stage">
    <header class="operator-topbar">
      <DrawerTrigger
        class="operator-topbar__menu"
        aria-label="Open navigation"
      >
        <ConsoleIcon name="menu" />
      </DrawerTrigger>

      <ContextSwitcher context={shell.context} />

      <div class="operator-topbar__actions">
        <ButtonRoot class="operator-search-trigger" variant="outline" onclick={() => (commandPaletteOpen = true)}>
          <ButtonIcon><ConsoleIcon name="search" /></ButtonIcon>
          <ButtonLabel>{searchEnabled ? 'Search or run a command' : 'Run a command'}</ButtonLabel>
          <kbd>⌘ K</kbd>
        </ButtonRoot>
        <ButtonRoot
          variant="ghost"
          size="icon-md"
          aria-label={`Use ${theme === 'uifn-dark' ? 'light' : 'dark'} theme`}
          onclick={toggleTheme}
        >
          <ButtonIcon><ConsoleIcon name={theme === 'uifn-dark' ? 'home' : 'activity'} /></ButtonIcon>
        </ButtonRoot>
        {#if overviewEnabled}
          <ButtonRoot variant="ghost" size="icon-md" aria-label="Open alerts" onclick={() => navigate('/?focus=alerts')}>
            <ButtonIcon><ConsoleIcon name="bell" /></ButtonIcon>
            {#if shell.overview.alerts.length}
              <BadgeRoot class="operator-topbar__alert-count" variant="destructive">
                {shell.overview.alerts.length}
              </BadgeRoot>
            {/if}
          </ButtonRoot>
        {/if}
      </div>
    </header>

    {#if navigating}
      <div class="operator-navigation-progress" role="status" aria-live="polite">
        <span aria-hidden="true"></span><span class="sr-only">Loading the next operator view</span>
      </div>
    {/if}

    {#if shell.error && shell.error.status !== 401 && shell.error.status !== 403}
      <div class="operator-degraded" role="status">
        <StatusBadge status="degraded" />
        <span>{shell.error.message}</span>
        {#if shell.error.requestId}<code>{shell.error.requestId}</code>{/if}
      </div>
    {/if}

    {#if $mutationFeedback}
      <div class="operator-degraded" role="status" aria-live="polite">
        <StatusBadge status={$mutationFeedback.ok ? 'healthy' : 'degraded'} />
        <span>{$mutationFeedback.message}</span>
      </div>
    {/if}

    <main id="operator-main" class="operator-main" tabindex="-1">
      {@render children()}
    </main>
    </div>
  </div>

  <DrawerPortal>
    <DrawerBackdrop />
    <DrawerPositioner>
      <DrawerContent class="operator-navigation-drawer__content">
        <DrawerTitle class="sr-only">Super Console navigation</DrawerTitle>
        <DrawerDescription class="sr-only">Enabled product modules and operator administration destinations.</DrawerDescription>
        <DrawerClose class="operator-navigation-drawer__close" aria-label="Close navigation">
          <ConsoleIcon name="close" />
        </DrawerClose>
        <OperatorNavigation
          {shell}
          {modules}
          {homeHref}
          {overviewEnabled}
          {searchEnabled}
          {apiEnabled}
          {mcpEnabled}
          {auditEnabled}
          {settingsEnabled}
          onNavigate={navigate}
          onSignOut={() => void signOut()}
        />
      </DrawerContent>
    </DrawerPositioner>
  </DrawerPortal>
</DrawerRoot>

<CommandPalette registry={shell.registry} bind:open={commandPaletteOpen} />
