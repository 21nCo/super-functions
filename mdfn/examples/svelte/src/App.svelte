<script lang="ts">
  import { onMount } from 'svelte';
  import { MdfnEditorShell } from '@mdfn/components-svelte';
  import type { MdfnEditorHandle } from '@mdfn/svelte';
  import { createExampleController, markdownForFiles, resetExample, type ExampleMode } from '../../shared';

  const controller = createExampleController();
  let mode = $state<ExampleMode>('visual');
  let markdown = $state(controller.getState().markdown);
  let status = $state('loading');

  onMount(() => {
    const unsubscribe = controller.subscribe((change) => markdown = change.current.markdown);
    return () => {
      unsubscribe();
      controller.destroy();
    };
  });
</script>

<main class="example-app" data-example-framework="svelte">
  <header class="example-hero">
    <div>
      <p class="example-kicker">MDFN · Svelte</p>
      <h1>Source-first authoring, at home in Svelte.</h1>
      <p class="example-intro">A complete editor shell with visual and source modes, preview, formatting, files, comments, review state, history, and diagnostics.</p>
    </div>
    <dl class="example-meta">
      <div><dt>Runtime</dt><dd>Svelte 5</dd></div>
      <div><dt>Mode</dt><dd data-example-mode>{mode}</dd></div>
      <div><dt>Characters</dt><dd data-example-characters>{markdown.length}</dd></div>
      <div><dt>Editor</dt><dd class="example-status" data-example-status>{status}</dd></div>
    </dl>
  </header>

  <section class="example-workspace" aria-label="Svelte Markdown workspace">
    <div class="example-workspace-header">
      <p class="example-document-name">product-launch.md</p>
      <button class="example-reset" type="button" aria-label="Reset example document" onclick={() => resetExample(controller)}>Reset document</button>
    </div>
    <MdfnEditorShell
      {controller}
      {mode}
      ariaLabel="MDFN Svelte example editor"
      actor={{ id: 'svelte-example-author' }}
      onModeChange={(next: ExampleMode) => mode = next}
      onSelectFiles={markdownForFiles}
      editorRef={(editor: MdfnEditorHandle | null) => { if (editor) status = 'ready'; }}
      onLoadError={() => status = 'error'}
    />
  </section>

  <aside class="example-source-card" aria-label="Live Markdown source">
    <div><h2>Live Markdown</h2><p>The same authoritative source updates as you work in any editor mode.</p></div>
    <pre class="example-source" data-example-markdown>{markdown}</pre>
  </aside>
</main>
