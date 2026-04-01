<script lang="ts">
  import { onMount } from "svelte";
  import { createDemoProxyClient, loadDemoNotes } from "../demoClient.js";

  export let clientId: string;
  export let context: {
    context: "options";
    surfaceId: string;
  };

  let notes: Array<Record<string, unknown>> = [];

  onMount(async () => {
    const client = createDemoProxyClient(clientId, { address: context });
    notes = await loadDemoNotes(client);
  });
</script>

<main class="canvas">
  <header>
    <h1>DataFn options</h1>
    <p>These rows come from the same background authority as the popup and content script.</p>
  </header>

  <div class="grid">
    {#each notes as note}
      <article>
        <h2>{note.title}</h2>
        <p>{note.summary}</p>
        <small>{note.surface}</small>
      </article>
    {/each}
  </div>
</main>

<style>
  .canvas {
    min-height: 100vh;
    padding: 2rem;
    color: #163247;
    background:
      radial-gradient(circle at top right, rgba(234, 180, 120, 0.45), transparent 35%),
      linear-gradient(180deg, #f8f3e8 0%, #e9dcc4 100%);
    font: 500 15px/1.5 "Avenir Next", "Segoe UI", sans-serif;
  }

  header {
    max-width: 48rem;
    margin-bottom: 1.5rem;
  }

  h1,
  h2,
  p {
    margin: 0;
  }

  .grid {
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  }

  article {
    padding: 1rem;
    border: 1px solid rgba(21, 48, 70, 0.12);
    background: rgba(255, 255, 255, 0.7);
    border-radius: 16px;
  }

  small {
    color: #5c7080;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
</style>
