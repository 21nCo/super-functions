<script lang="ts">
  import { ToolbarButton, ToolbarRoot } from '@uifn/components-svelte';
  import { createToolbarModel, runToolbarAction, type ToolbarCommandTarget, type ToolbarGroup } from '@mdfn/components';
  import type { EditorController } from '@mdfn/core';

  let { controller, groups, ariaLabel = 'Markdown formatting', class: className = '', commandTarget = null }: { controller: EditorController; groups?: readonly ToolbarGroup[]; ariaLabel?: string; class?: string; commandTarget?: ToolbarCommandTarget | null } = $props();
  let version = $state(0);
  $effect(() => {
    version = controller.getState().version;
    return controller.subscribe((change) => { version = change.current.version; });
  });
  const model = $derived.by(() => { void version; return createToolbarModel(controller, groups, ariaLabel, commandTarget); });
</script>

<ToolbarRoot class={className} data-mdfn-component="toolbar" aria-label={model.ariaLabel}>
  {#each model.groups as group (group.id)}
    <span role="group" aria-label={group.label} data-mdfn-toolbar-group={group.id}>
      {#each group.actions as action (action.id)}
        <ToolbarButton value={action.id} type="button" disabled={action.disabled} aria-label={action.label} aria-pressed={action.pressed} title={action.shortcut ? `${action.label} (${action.shortcut})` : action.label} onclick={() => runToolbarAction(controller, action, commandTarget)}>{action.label}</ToolbarButton>
      {/each}
    </span>
  {/each}
</ToolbarRoot>
