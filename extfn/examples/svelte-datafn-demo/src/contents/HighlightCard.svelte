<script lang="ts">
  import { onMount } from "svelte";
  import { createDemoProxyClient, loadDemoNotes } from "../demoClient.js";

  export let clientId: string;

  let notes: Array<Record<string, unknown>> = [];

  onMount(async () => {
    const client = createDemoProxyClient(clientId, {
      address: {
        context: "content",
        contentScriptId: "datafn-highlights",
      },
    });
    notes = await loadDemoNotes(client);
  });
</script>

<aside class="card">
  <h2>Content notes</h2>

  {#each notes as note}
    <div class="row">
      <strong>{note.title}</strong>
      <span>{note.summary}</span>
    </div>
  {/each}
</aside>

<style>
  .card {
    position: fixed;
    right: 1rem;
    bottom: 1rem;
    z-index: 2147483647;
    width: min(320px, calc(100vw - 2rem));
    padding: 0.9rem;
    border-radius: 18px;
    color: #173448;
    background: rgba(247, 242, 231, 0.95);
    border: 1px solid rgba(23, 52, 72, 0.14);
    box-shadow: 0 18px 45px rgba(17, 37, 52, 0.22);
    font: 500 13px/1.45 "Avenir Next", "Segoe UI", sans-serif;
  }

  h2 {
    margin: 0 0 0.6rem;
    font-size: 0.95rem;
  }

  .row + .row {
    margin-top: 0.55rem;
  }

  span {
    display: block;
    color: #516474;
  }
</style>
