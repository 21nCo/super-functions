<!-- ApifnApiReference.svelte — Svelte API reference renderer (DOCS-003, DOCS-005) -->
<script lang="ts">
  import EndpointViewer from "@apifn/svelte/EndpointViewer.svelte";
  import TryIt from "@apifn/svelte/TryIt.svelte";
  import PerformanceOverlay from "@apifn/svelte/PerformanceOverlay.svelte";
  import type { ApifnApiReferenceProps, RawContentEntry, ApiEndpoint } from "../types.js";

  export let entry: RawContentEntry;
  export let tryIt: boolean = false;
  export let baseUrl: string = "https://api.example.com";
  export let theme: "light" | "dark" | "auto" = "auto";
  export let performanceMetrics: ApifnApiReferenceProps["performanceMetrics"] = undefined;

  const METHOD_COLORS: Record<string, { bg: string; text: string }> = {
    get: { bg: "#065f46", text: "#6ee7b7" }, post: { bg: "#1e3a5f", text: "#93c5fd" },
    put: { bg: "#78350f", text: "#fcd34d" }, patch: { bg: "#5b21b6", text: "#c4b5fd" },
    delete: { bg: "#7f1d1d", text: "#fca5a5" },
  };

  function mc(method: string) {
    return METHOD_COLORS[method.toLowerCase()] ?? { bg: "#2d3748", text: "#9ca3af" };
  }

  $: effectiveBaseUrl = (entry.spec as { servers?: Array<{ url: string }> }).servers?.[0]?.url ?? baseUrl;

  // Per-endpoint card open/tab state
  let openStates: Record<string, boolean> = {};
  let tabStates: Record<string, "docs" | "tryit" | "perf"> = {};

  function toggle(key: string) { openStates[key] = !openStates[key]; openStates = openStates; }
  function setTab(key: string, t: "docs" | "tryit" | "perf") { tabStates[key] = t; tabStates = tabStates; }

  function anchorId(ep: ApiEndpoint) { return `${ep.method.toLowerCase()}-${ep.path.replace(/[^a-z0-9]/gi, "-")}`; }
  function perfKey(ep: ApiEndpoint) { return `${ep.method.toUpperCase()} ${ep.path}`; }

  function getThemeVars(t: "light" | "dark" | "auto"): string {
    const dark = `--apifn-bg:#0f1117;--apifn-bg-surface:#1a1d2e;--apifn-bg-surface-hover:#252840;--apifn-border:#2d3748;--apifn-text:#e2e8f0;--apifn-text-muted:#64748b;--apifn-accent:#7c3aed;--apifn-accent-text:#c4b5fd;--apifn-green:#6ee7b7;--apifn-blue:#93c5fd;--apifn-yellow:#fcd34d;--apifn-red:#fca5a5;--apifn-radius:6px;--apifn-font-mono:'JetBrains Mono',monospace;--apifn-font-sans:-apple-system,sans-serif`;
    const light = `--apifn-bg:#ffffff;--apifn-bg-surface:#f8fafc;--apifn-bg-surface-hover:#f1f5f9;--apifn-border:#e2e8f0;--apifn-text:#0f172a;--apifn-text-muted:#64748b;--apifn-accent:#7c3aed;--apifn-accent-text:#6d28d9;--apifn-green:#059669;--apifn-blue:#2563eb;--apifn-yellow:#d97706;--apifn-red:#dc2626;--apifn-radius:6px;--apifn-font-mono:'JetBrains Mono',monospace;--apifn-font-sans:-apple-system,sans-serif`;
    return t === "dark" ? dark : light;
  }
</script>

<div class="apifn-root" style={getThemeVars(theme)}>
  <div class="page">
    <h1 class="page-title">{entry.title}</h1>
    {#if entry.tag}
      <div class="page-subtitle">
        Tag: <code>{entry.tag}</code>
        — {entry.endpoints.length} endpoint{entry.endpoints.length !== 1 ? "s" : ""}
      </div>
    {/if}

    {#each entry.endpoints as ep}
      {@const key = `${ep.method}-${ep.path}`}
      {@const isOpen = openStates[key] ?? false}
      {@const tab = tabStates[key] ?? "docs"}
      {@const metrics = performanceMetrics?.[perfKey(ep)]}

      <div id={anchorId(ep)} class="card">
        <!-- Card Header -->
        <div class="card-header" role="button" tabindex="0"
          on:click={() => toggle(key)}
          on:keydown={(e) => e.key === "Enter" && toggle(key)}
        >
          <span class="method-badge" style="background:{mc(ep.method).bg};color:{mc(ep.method).text}">
            {ep.method.toUpperCase()}
          </span>
          <span class="card-path">{ep.path}</span>
          {#if ep.operation.summary}
            <span class="card-summary">{ep.operation.summary}</span>
          {/if}
          <span class="chevron" class:open={isOpen}>▼</span>
        </div>

        {#if isOpen}
          <!-- Tabs -->
          <div class="tabs">
            <button class="tab" class:active={tab === "docs"} on:click={() => setTab(key, "docs")}>Docs</button>
            {#if tryIt}
              <button class="tab" class:active={tab === "tryit"} on:click={() => setTab(key, "tryit")}>Try It</button>
            {/if}
            {#if metrics}
              <button class="tab" class:active={tab === "perf"} on:click={() => setTab(key, "perf")}>Performance</button>
            {/if}
          </div>

          <!-- Tab Content -->
          {#if tab === "docs"}
            <EndpointViewer path={ep.path} method={ep.method} operation={ep.operation} />
          {:else if tab === "tryit" && tryIt}
            <TryIt path={ep.path} method={ep.method} operation={ep.operation} baseUrl={effectiveBaseUrl} />
          {:else if tab === "perf" && metrics}
            <div class="perf-wrap">
              <PerformanceOverlay metrics={{ endpoint: ep.path, method: ep.method, lastUpdated: new Date().toISOString(), ...metrics }} />
            </div>
          {/if}
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .apifn-root { font-family: var(--apifn-font-sans, sans-serif); color: var(--apifn-text); background: var(--apifn-bg); }
  .page { max-width: 960px; margin: 0 auto; padding: 0 24px 48px; }
  .page-title { font-size: 28px; font-weight: 800; margin-bottom: 8px; }
  .page-subtitle { font-size: 14px; color: var(--apifn-text-muted); margin-bottom: 40px; }
  code { font-family: var(--apifn-font-mono); }
  .card { border: 1px solid var(--apifn-border); border-radius: var(--apifn-radius); margin-bottom: 24px; overflow: hidden; background: var(--apifn-bg-surface); }
  .card-header { display: flex; align-items: center; gap: 12px; padding: 14px 20px; cursor: pointer; border-bottom: 1px solid var(--apifn-border); }
  .method-badge { padding: 3px 10px; border-radius: 3px; font-weight: 700; font-size: 12px; font-family: var(--apifn-font-mono); text-transform: uppercase; }
  .card-path { font-family: var(--apifn-font-mono); font-size: 14px; font-weight: 600; flex: 1; }
  .card-summary { font-size: 13px; color: var(--apifn-text-muted); }
  .chevron { color: var(--apifn-text-muted); font-size: 12px; transition: transform .15s; }
  .chevron.open { transform: rotate(180deg); }
  .tabs { display: flex; border-bottom: 1px solid var(--apifn-border); padding: 0 20px; }
  .tab { padding: 10px 14px; font-size: 13px; font-weight: 400; color: var(--apifn-text-muted); border: none; border-bottom: 2px solid transparent; background: none; cursor: pointer; }
  .tab.active { font-weight: 600; color: var(--apifn-text); border-bottom-color: var(--apifn-accent); }
  .perf-wrap { padding: 20px; }
</style>
