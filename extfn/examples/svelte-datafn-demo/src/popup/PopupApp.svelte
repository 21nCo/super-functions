<script lang="ts">
  import { onMount } from "svelte";
  import { createDemoProxyClient, loadDemoNotes } from "../demoClient.js";

  export let clientId: string;
  export let heading: string;
  export let context: {
    context: "popup";
    surfaceId: string;
  };

  let notes: Array<Record<string, unknown>> = [];

  onMount(async () => {
    const client = createDemoProxyClient(clientId, { address: context });
    notes = await loadDemoNotes(client);
  });
</script>

<section class="panel">
  <h1>{heading}</h1>
  <p>Background-owned DataFn storage, queried through the extfn proxy client.</p>

  <ul>
    {#each notes as note}
      <li>
        <strong>{note.title}</strong>
        <span>{note.summary}</span>
      </li>
    {/each}
  </ul>
</section>

<style>
  .panel {
    width: 320px;
    padding: 1rem;
    color: #143046;
    background: linear-gradient(180deg, #f7f2e7 0%, #f0e0c6 100%);
    font: 500 14px/1.4 "Avenir Next", "Segoe UI", sans-serif;
  }

  h1 {
    margin: 0 0 0.5rem;
    font-size: 1.1rem;
  }

  p {
    margin: 0 0 0.9rem;
  }

  ul {
    margin: 0;
    padding-left: 1rem;
  }

  li {
    margin-bottom: 0.5rem;
  }

  span {
    display: block;
    color: #42586a;
  }
</style>
