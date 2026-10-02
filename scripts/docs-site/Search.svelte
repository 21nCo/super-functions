<script lang="ts">
  import { createDocsSearchRuntime, type DocsSearchRuntimeResultItem } from "@docsfn/core/search-runtime";

  let dialog: HTMLDialogElement;
  let input: HTMLInputElement;
  let query = $state("");
  let results = $state<DocsSearchRuntimeResultItem[]>([]);
  let pending = $state(false);
  let failure = $state("");
  let requestId = 0;
  const runtime = createDocsSearchRuntime({
    loadArtifact: async () => {
      const response = await fetch("/docs/search.json");
      if (!response.ok) throw new Error("Could not load documentation search.");
      return response.json();
    },
  });

  function openSearch() {
    if (!dialog.open) dialog.showModal();
    input.focus();
  }

  function shortcut(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      openSearch();
    }
  }

  async function search() {
    const current = ++requestId;
    failure = "";
    results = [];
    pending = Boolean(query.trim());
    if (!pending) return;
    try {
      const found = await runtime.query({ query, scope: "all", limit: 10 });
      if (current === requestId) results = found;
    } catch {
      if (current === requestId) failure = "Search is unavailable. Please try again.";
    } finally {
      if (current === requestId) pending = false;
    }
  }
</script>

<svelte:window onkeydown={shortcut} />
<button class="docsfn-search-trigger" type="button" onclick={openSearch} aria-haspopup="dialog">
  Search <span aria-hidden="true">⌘/Ctrl K</span>
</button>
<dialog bind:this={dialog} aria-labelledby="docs-search-title">
  <div class="search-heading">
    <h2 id="docs-search-title">Search documentation</h2>
    <button type="button" onclick={() => dialog.close()} aria-label="Close search">Close</button>
  </div>
  <label for="docs-search-query">Search terms</label>
  <input id="docs-search-query" bind:this={input} value={query} oninput={(event) => { query = event.currentTarget.value; void search(); }} type="search" autocomplete="off" placeholder="Search documentation…" />
  <p role="status">{failure ? "" : pending ? "Searching…" : query.trim() ? `${results.length} results` : "Enter a term to search."}</p>
  {#if failure}<p role="alert">{failure}</p>{/if}
  <ul>
    {#each results as result (`${result.id}:${result.path}`)}
      <li><a href={result.path} onclick={() => dialog.close()}>{result.title}</a></li>
    {/each}
  </ul>
</dialog>

<style>
  button { cursor: pointer; border: 1px solid var(--docsfn-color-border); border-radius: .375rem; padding: .45rem .65rem; color: var(--docsfn-color-fg); background: var(--docsfn-color-surface); }
  .docsfn-search-trigger { display: flex; gap: .75rem; align-items: center; }
  .docsfn-search-trigger span { font-size: .7rem; color: var(--docsfn-color-muted); }
  dialog { box-sizing: border-box; width: min(38rem, calc(100vw - 2rem)); max-height: 80vh; padding: 1.25rem; border: 1px solid var(--docsfn-color-border); border-radius: .75rem; background: var(--docsfn-color-surface); color: var(--docsfn-color-fg); }
  dialog::backdrop { background: rgb(15 23 42 / .45); }
  .search-heading { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
  h2 { font-size: 1.1rem; margin: 0; }
  label { display: block; margin-bottom: .35rem; }
  input { box-sizing: border-box; width: 100%; padding: .65rem; border: 1px solid var(--docsfn-color-border); border-radius: .375rem; color: inherit; background: var(--docsfn-color-bg); }
  p { font-size: .875rem; }
  ul { list-style: none; padding: 0; }
  a { display: block; padding: .65rem; color: var(--docsfn-color-primary); border-radius: .25rem; }
  a:hover, a:focus-visible { background: var(--docsfn-color-accent-soft); }
  @media (max-width: 600px) { .docsfn-search-trigger span { display: none; } }
</style>
