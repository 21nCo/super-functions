<script lang="ts">
  type Capabilities = {
    sidepanel: boolean;
    offscreen: boolean;
    scripting: boolean;
  };

  let {
    capabilities,
    target,
  }: {
    capabilities: Capabilities;
    target: string;
  } = $props();
</script>

<main class="shell">
  <section class="hero">
    <p class="eyebrow">Svelte 5 Adapter Demo</p>
    <h1>Popup and content modules share the same extfn core.</h1>
    <p class="lede">
      This popup is mounted through <code>mountSveltePage()</code>, while the
      content entries use <code>mountSvelteContent()</code>.
    </p>
  </section>

  <section class="card">
    <h2>Active target</h2>
    <p>{target}</p>
  </section>

  <section class="card">
    <h2>Capabilities</h2>
    <ul>
      <li>Sidepanel: {capabilities.sidepanel ? 'yes' : 'no'}</li>
      <li>Offscreen: {capabilities.offscreen ? 'yes' : 'no'}</li>
      <li>Scripting: {capabilities.scripting ? 'yes' : 'no'}</li>
    </ul>
  </section>
</main>

<style>
  :global(body) {
    margin: 0;
    background:
      radial-gradient(circle at top, rgba(59, 130, 246, 0.18), transparent 45%),
      linear-gradient(180deg, #f8fafc, #e2e8f0);
    color: #0f172a;
    font-family: "Avenir Next", system-ui, sans-serif;
  }

  .shell {
    width: 360px;
    min-height: 100vh;
    padding: 1rem;
    display: grid;
    gap: 0.9rem;
    box-sizing: border-box;
  }

  .hero,
  .card {
    border-radius: 1rem;
    padding: 1rem;
    background: rgba(255, 255, 255, 0.88);
    border: 1px solid rgba(148, 163, 184, 0.35);
    box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
  }

  .eyebrow {
    margin: 0 0 0.4rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 0.7rem;
    color: #2563eb;
  }

  h1,
  h2,
  p,
  ul {
    margin: 0;
  }

  .hero {
    display: grid;
    gap: 0.7rem;
  }

  .lede {
    color: #334155;
    line-height: 1.5;
  }

  .card {
    display: grid;
    gap: 0.5rem;
  }

  ul {
    padding-left: 1rem;
  }
</style>
