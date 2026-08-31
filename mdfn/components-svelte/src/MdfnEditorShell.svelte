<script lang="ts">
  import { MdfnEditor } from '@mdfn/svelte';
  import { captureMarkdownInsertion, insertUploadedMarkdown, type AuthoringVersion, type MarkdownUploadResult, type ToolbarGroup } from '@mdfn/components';
  import type { MdfnEditorHandle, MdfnEditorProps } from '@mdfn/svelte';
  import type { ToolbarCommandTarget } from '@mdfn/components';
  import MdfnToolbar from './MdfnToolbar.svelte';
  import MdfnAuthoringChrome from './MdfnAuthoringChrome.svelte';
  import type { EditorialActor } from '@mdfn/core';
  let { toolbarGroups, hideToolbar = false, hideAuthoringChrome = false, actor, onSelectFiles, onModeChange, versions, onRestoreVersion, class: className = '', ...editorProps }: MdfnEditorProps & { toolbarGroups?: readonly ToolbarGroup[]; hideToolbar?: boolean; hideAuthoringChrome?: boolean; actor?: EditorialActor; onSelectFiles?: (files: readonly File[]) => Promise<MarkdownUploadResult>; onModeChange?: (mode: NonNullable<MdfnEditorProps['mode']>) => void; versions?: readonly AuthoringVersion[]; onRestoreVersion?: (version: number) => void | Promise<void> } = $props();
  let editor = $state<MdfnEditorHandle | null>(null);
  let insertionLifecycle = new AbortController();
  $effect(() => {
    editorProps.controller;
    const lifecycle = new AbortController();
    insertionLifecycle = lifecycle;
    return () => lifecycle.abort();
  });
  const readOnly = $derived(editorProps.readOnly === true || editorProps.mode === 'read-only');
  const commandTarget = $derived.by<ToolbarCommandTarget | null>(() => editor ? ({
    can: (command: string) => editor?.can(command as Parameters<MdfnEditorHandle['can']>[0]) ?? false,
    run: (command: string) => editor?.run(command as Parameters<MdfnEditorHandle['run']>[0]) ?? false,
  }) : null);
  function setEditor(value: MdfnEditorHandle | null) {
    editor = value;
    editorProps.editorRef?.(value);
  }
  async function handleFiles(files: readonly File[]) {
    const insertion = captureMarkdownInsertion(editorProps.controller, insertionLifecycle.signal);
    try {
      await insertUploadedMarkdown(insertion, Promise.resolve(onSelectFiles?.(files)));
      await editorProps.onFiles?.(files);
    } catch (error) {
      insertion.cancel();
      throw error;
    }
  }
</script>

<div class={className} data-mdfn-component="editor-shell">
  {#if !hideToolbar && !readOnly}<MdfnToolbar controller={editorProps.controller} groups={toolbarGroups} {commandTarget} />{/if}
  {#if !hideAuthoringChrome}<MdfnAuthoringChrome controller={editorProps.controller} {editor} mode={editorProps.mode} {readOnly} {actor} {onSelectFiles} {onModeChange} {versions} {onRestoreVersion} />{/if}
  <MdfnEditor {...editorProps} {readOnly} onFiles={handleFiles} editorRef={setEditor} />
</div>
