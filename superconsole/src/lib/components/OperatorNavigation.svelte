<script lang="ts">
  import { page } from '$app/state';
  import { AvatarFallback, AvatarImage, AvatarRoot } from '@uifn/components-svelte/avatar';
  import { ButtonIcon, ButtonRoot } from '@uifn/components-svelte/button';
  import ConsoleIcon from './ConsoleIcon.svelte';
  import { safeAvatarHref } from './admin-api';
  import type { AdminModuleViewModel, ShellViewModel } from './view-models';

  let {
    shell,
    modules,
    homeHref,
    overviewEnabled,
    searchEnabled,
    apiEnabled,
    mcpEnabled,
    auditEnabled,
    settingsEnabled,
    onNavigate,
    onSignOut,
  }: {
    shell: ShellViewModel;
    modules: AdminModuleViewModel[];
    homeHref: string;
    overviewEnabled: boolean;
    searchEnabled: boolean;
    apiEnabled: boolean;
    mcpEnabled: boolean;
    auditEnabled: boolean;
    settingsEnabled: boolean;
    onNavigate: (href: string) => void;
    onSignOut: () => void;
  } = $props();

  const groups = $derived([...new Set(modules.map((module) => module.group ?? 'Functions'))]);
  const initials = $derived((shell.session?.displayName ?? shell.session?.email ?? 'Auth')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join(''));
  const avatarHref = $derived(safeAvatarHref(shell.session?.avatarUrl));

  function moduleIsActive(module: AdminModuleViewModel) {
    return page.url.pathname === module.href || page.url.pathname.startsWith(`${module.href}/`);
  }
</script>

<div class="operator-navigation-panel">
  <div class="operator-brand">
    <ButtonRoot class="operator-brand__mark" variant="ghost" type="button" aria-label="Open Super Console home" onclick={() => onNavigate(homeHref)}>
      <span>SF</span>
    </ButtonRoot>
    <ButtonRoot class="operator-brand__copy" variant="ghost" type="button" onclick={() => onNavigate(homeHref)}>
      <strong>Super Console</strong>
      <span>Operator administration</span>
    </ButtonRoot>
  </div>

  <nav class="operator-navigation" aria-label="Super Console navigation">
    {#if overviewEnabled || searchEnabled}
      <p class="operator-navigation__label">Platform</p>
      {#if overviewEnabled}
        <ButtonRoot class={page.url.pathname === '/' ? 'active' : ''} variant="ghost" type="button" onclick={() => onNavigate('/')}>
          <ConsoleIcon name="home" />
          <span>Overview</span>
        </ButtonRoot>
      {/if}
      {#if searchEnabled}
        <ButtonRoot class={page.url.pathname.startsWith('/search') ? 'active' : ''} variant="ghost" type="button" onclick={() => onNavigate('/search')}>
          <ConsoleIcon name="search" />
          <span>Global search</span>
        </ButtonRoot>
      {/if}
    {/if}

    {#each groups as group (group)}
      <p class="operator-navigation__label">{group}</p>
      {#each modules.filter((module) => (module.group ?? 'Functions') === group) as module (module.id)}
        <ButtonRoot class={moduleIsActive(module) ? 'active' : ''} variant="ghost" type="button" onclick={() => onNavigate(module.href)}>
          <span class="operator-navigation__module-icon" aria-hidden="true">
            {module.name.slice(0, 2).toUpperCase()}
          </span>
          <span>{module.name}</span>
          {#if module.health && module.health !== 'healthy'}
            <span class={`operator-navigation__health operator-navigation__health--${module.health}`}>
              <span class="sr-only">{module.health}</span>
            </span>
          {/if}
        </ButtonRoot>
      {/each}
    {/each}
  </nav>

  <div class="operator-sidebar__footer">
    {#if apiEnabled || mcpEnabled}
      <p class="operator-navigation__label">Developer access</p>
      {#if apiEnabled}
        <ButtonRoot class={page.url.pathname.startsWith('/api') ? 'active' : ''} variant="ghost" type="button" onclick={() => onNavigate('/api')}>
          <ConsoleIcon name="api" /><span>Admin API</span>
        </ButtonRoot>
      {/if}
      {#if mcpEnabled}
        <ButtonRoot class={page.url.pathname.startsWith('/mcp') ? 'active' : ''} variant="ghost" type="button" onclick={() => onNavigate('/mcp')}>
          <ConsoleIcon name="mcp" /><span>MCP access</span>
        </ButtonRoot>
      {/if}
    {/if}
    {#if auditEnabled || settingsEnabled}
      <p class="operator-navigation__label">Administration</p>
      {#if auditEnabled}
        <ButtonRoot class={page.url.pathname.startsWith('/audit') ? 'active' : ''} variant="ghost" type="button" onclick={() => onNavigate('/audit')}>
          <ConsoleIcon name="audit" /><span>Audit trail</span>
        </ButtonRoot>
      {/if}
      {#if settingsEnabled}
        <ButtonRoot class={page.url.pathname.startsWith('/settings') ? 'active' : ''} variant="ghost" type="button" onclick={() => onNavigate('/settings')}>
          <ConsoleIcon name="settings" /><span>Settings</span>
        </ButtonRoot>
      {/if}
    {/if}
    <div class="operator-identity">
      <AvatarRoot class="operator-identity__avatar" size="sm">
        {#if avatarHref}<AvatarImage src={avatarHref} alt="" />{/if}
        <AvatarFallback>{initials}</AvatarFallback>
      </AvatarRoot>
      <div>
        <strong>{shell.session?.displayName ?? shell.session?.email ?? (shell.error?.status === 401 ? 'Sign in required' : 'Authorized operator')}</strong>
        <span>{shell.session?.role ?? (shell.error?.status === 401 ? 'Operator realm' : 'Session protected')}</span>
      </div>
      {#if shell.session}
        <ButtonRoot variant="ghost" size="icon-sm" aria-label="Sign out" onclick={onSignOut}>
          <ButtonIcon><ConsoleIcon name="arrow-right" /></ButtonIcon>
        </ButtonRoot>
      {/if}
    </div>
  </div>
</div>
