<script lang="ts">
  import type { EditorController } from '@mdfn/core';
  import MdfnEditor from '../src/MdfnEditor.svelte';

  let {
    controller,
    alternate,
  }: { controller: EditorController; alternate: EditorController } = $props();

  let active = $state<EditorController>();
  let readOnly = $state(false);
  let ariaLabel = $state('Initial editor');
  let refVersion = $state(0);

  $effect(() => { active ??= controller; });

  export function useAlternate(): void { active = alternate; }
  export function updateSurface(): void {
    readOnly = true;
    ariaLabel = 'Updated editor';
    refVersion += 1;
  }
</script>

{#if active}
  <MdfnEditor
    controller={active}
    mode="source"
    {readOnly}
    {ariaLabel}
    editorRef={(value) => { if (value) void refVersion; }}
  />
{/if}
