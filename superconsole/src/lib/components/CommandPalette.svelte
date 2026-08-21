<script lang="ts">
  import { goto } from '$app/navigation';
  import {
    CommandEmpty,
    CommandGroup,
    CommandGroupHeading,
    CommandInput,
    CommandItem,
    CommandList,
    CommandRoot,
    CommandShortcut,
  } from '@uifn/components-svelte/command';
  import {
    DialogBackdrop,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogPortal,
    DialogPositioner,
    DialogRoot,
    DialogTitle,
  } from '@uifn/components-svelte/dialog';
  import { onMount } from 'svelte';
  import ConsoleIcon from './ConsoleIcon.svelte';
  import { safeConsoleNavigationHref, scopedConsoleHref } from './admin-api';
  import { enabledNavigationModules, shellSurfaceEnabled, type RegistryViewModel } from './view-models';

  let {
    registry,
    open = $bindable(false),
  }: { registry: RegistryViewModel; open?: boolean } = $props();

  let query = $state('');
  const modules = $derived(enabledNavigationModules(registry));
  const staticCommands = [
    { id: 'overview', label: 'Open overview', href: '/', group: 'Navigate', icon: 'home', shortcut: 'G O' },
    { id: 'search', label: 'Search all resources', href: '/search', group: 'Navigate', icon: 'search', shortcut: 'G S' },
    { id: 'audit', label: 'Review audit trail', href: '/audit', group: 'Operate', icon: 'audit', shortcut: 'G A' },
    { id: 'api', label: 'Open admin API', href: '/api', group: 'Develop', icon: 'api', shortcut: 'G D' },
    { id: 'mcp', label: 'Manage MCP access', href: '/mcp', group: 'Develop', icon: 'mcp', shortcut: 'G M' },
    { id: 'settings', label: 'Open console settings', href: '/settings', group: 'Operate', icon: 'settings', shortcut: 'G ,' },
  ];
  const commands = $derived([
    ...staticCommands.filter((command) => {
      if (command.id === 'search') return shellSurfaceEnabled(registry, 'search');
      if (command.id === 'overview') return shellSurfaceEnabled(registry, 'overview');
      if (command.id === 'audit' || command.id === 'api' || command.id === 'mcp' || command.id === 'settings') {
        return shellSurfaceEnabled(registry, command.id);
      }
      return true;
    }),
    ...modules.map((module) => ({
      id: `module-${module.id}`,
      label: `Open ${module.name}`,
      href: module.href,
      group: 'Modules',
      icon: 'module',
      shortcut: '',
    })),
  ]);
  const commandValue = (command: (typeof commands)[number]) =>
    `${command.label} ${command.group} ${command.id}`.toLowerCase();
  const filtered = $derived(commands.filter((command) =>
    commandValue(command).includes(query.toLowerCase())
  ));

  function selectCommand(value: string) {
    const command = commands.find((candidate) => commandValue(candidate) === value);
    if (command) choose(command.href);
  }

  function choose(href: string) {
    open = false;
    query = '';
    const current = new URL(window.location.href);
    const safeHref = safeConsoleNavigationHref(href, current.origin);
    if (safeHref) void goto(scopedConsoleHref(safeHref, current.searchParams));
  }

  onMount(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        open = !open;
      }
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  });
</script>

<DialogRoot {open} onOpenChange={(next: boolean) => (open = next)}>
  <DialogPortal>
    <DialogBackdrop class="command-dialog__backdrop" />
    <DialogPositioner class="command-dialog__positioner">
      <DialogContent class="command-dialog">
        <div class="sr-only">
          <DialogTitle>Super Console command palette</DialogTitle>
          <DialogDescription>Search enabled modules and operator destinations.</DialogDescription>
        </div>
        <CommandRoot inputValue={query} onInputValueChange={(value: string) => (query = value)} onValueChange={selectCommand}>
          <div class="command-dialog__search">
            <ConsoleIcon name="search" size={19} />
            <CommandInput placeholder="Search modules and actions…" aria-label="Search commands" autofocus />
            <DialogClose aria-label="Close command palette">
              <span aria-hidden="true">Esc</span>
            </DialogClose>
          </div>
          <CommandList class="command-dialog__list">
            {#if filtered.length === 0}
              <CommandEmpty>No command matches “{query}”.</CommandEmpty>
            {/if}
            {#each ['Navigate', 'Modules', 'Operate', 'Develop'] as group}
              {@const groupCommands = filtered.filter((command) => command.group === group)}
              {#if groupCommands.length}
                <CommandGroup value={group.toLowerCase()}>
                  <CommandGroupHeading value={`${group.toLowerCase()}-heading`}>{group}</CommandGroupHeading>
                  {#each groupCommands as command (command.id)}
                    <CommandItem value={commandValue(command)}>
                      <span class="command-dialog__item-icon"><ConsoleIcon name={command.icon} /></span>
                      <span>{command.label}</span>
                      {#if command.shortcut}<CommandShortcut value={`${command.id}-shortcut`}>{command.shortcut}</CommandShortcut>{/if}
                    </CommandItem>
                  {/each}
                </CommandGroup>
              {/if}
            {/each}
          </CommandList>
        </CommandRoot>
      </DialogContent>
    </DialogPositioner>
  </DialogPortal>
</DialogRoot>
