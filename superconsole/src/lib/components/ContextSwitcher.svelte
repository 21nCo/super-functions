<script lang="ts">
  import { goto } from '$app/navigation';
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
  import ConsoleIcon from './ConsoleIcon.svelte';
  import { switchAdminContextHref } from './admin-api';
  import type { ContextOptionViewModel, OperatorContextViewModel } from './view-models';

  let { context }: { context: OperatorContextViewModel } = $props();

  const levels = $derived([
    { key: 'organization', label: 'Organization', current: context.organization, options: context.organizations ?? [] },
    { key: 'workspace', label: 'Workspace', current: context.workspace, options: context.workspaces ?? [] },
    { key: 'project', label: 'Project', current: context.project, options: context.projects ?? [] },
    { key: 'environment', label: 'Environment', current: context.environment, options: context.environments ?? [] },
  ].filter((level) => level.current || level.options.length));

  function switchContext(level: string, next: string | string[]) {
    const value = Array.isArray(next) ? next[0] : next;
    if (!value) return;
    void goto(switchAdminContextHref(window.location.href, level as 'organization' | 'workspace' | 'project' | 'environment', value));
  }

  function optionLabel(options: ContextOptionViewModel[], value?: string) {
    return options.find((option) => option.id === value)?.name ?? value;
  }
</script>

<div class="context-switcher" aria-label="Active administration scope">
  {#each levels as level, index (level.key)}
    {#if index > 0}<span class="context-switcher__separator" aria-hidden="true">/</span>{/if}
    <SelectRoot
      value={level.current?.id}
      onValueChange={(value: string | string[]) => switchContext(level.key, value)}
    >
      <SelectTrigger class="context-switcher__trigger" aria-label={`Change ${level.label}`}>
        <span class="context-switcher__label">{level.label}</span>
        <SelectValueText placeholder={level.current?.name ?? `Select ${level.label.toLowerCase()}`}>
          {optionLabel(level.options, level.current?.id) ?? level.current?.name}
        </SelectValueText>
        <ConsoleIcon name="chevron-down" size={14} />
      </SelectTrigger>
      <SelectPositioner>
        <SelectContent class="context-switcher__content">
          {#each level.options as option (option.id)}
            <SelectItem value={option.id} class="context-switcher__item">
              <SelectItemText>{option.name}</SelectItemText>
              <SelectItemIndicator><ConsoleIcon name="check" size={14} /></SelectItemIndicator>
            </SelectItem>
          {/each}
        </SelectContent>
      </SelectPositioner>
    </SelectRoot>
  {/each}
</div>
