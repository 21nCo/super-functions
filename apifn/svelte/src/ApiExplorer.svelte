<!-- ApiExplorer.svelte — full API explorer shell (UI-S-001) -->
<script lang="ts">
  import { onMount } from "svelte";
  import type { OpenAPIDocument, OperationObject } from "@apifn/core";
  import EndpointViewer from "./EndpointViewer.svelte";
  import TryIt from "./TryIt.svelte";
  import RequestHistory from "./RequestHistory.svelte";
  import PerformanceOverlay from "./PerformanceOverlay.svelte";
  import type { WatchFnClient, EndpointMetrics, RateLimitInfo } from "@apifn/core";

  export let spec: OpenAPIDocument;
  export let baseUrl: string | undefined = undefined;
  export let theme: "light" | "dark" | "auto" = "auto";
  export let showHistory: boolean = true;
  export let watchfn: WatchFnClient | undefined = undefined;
  export let watchfnInterval: number = 10000;
  export let rateLimits: Record<string, RateLimitInfo> | undefined = undefined;

  interface EndpointItem { path: string; method: string; operation: OperationObject; tag: string; }
  interface HistoryEntry {
    id: string; timestamp: number; method: string; url: string;
    statusCode?: number; duration?: number; responseBody?: unknown; responseHeaders?: Record<string, string>;
  }

  const HTTP_METHODS = ["get","post","put","patch","delete","head","options"] as const;
  const METHOD_COLORS: Record<string, { bg: string; text: string }> = {
    get: { bg: "#065f46", text: "#6ee7b7" }, post: { bg: "#1e3a5f", text: "#93c5fd" },
    put: { bg: "#78350f", text: "#fcd34d" }, patch: { bg: "#5b21b6", text: "#c4b5fd" },
    delete: { bg: "#7f1d1d", text: "#fca5a5" },
  };

  function collectEndpoints(spec: OpenAPIDocument): EndpointItem[] {
    const items: EndpointItem[] = [];
    for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
      if (!pathItem) continue;
      for (const method of HTTP_METHODS) {
        const op = pathItem[method] as OperationObject | undefined;
        if (!op) continue;
        const tags = (op.tags as string[]) ?? ["default"];
        items.push({ path, method, operation: op, tag: tags[0] ?? "default" });
      }
    }
    return items;
  }

  function getThemeCSS(t: "light" | "dark" | "auto"): string {
    const dark = `--apifn-bg:#0f1117;--apifn-bg-surface:#1a1d2e;--apifn-bg-surface-hover:#252840;--apifn-border:#2d3748;--apifn-text:#e2e8f0;--apifn-text-muted:#64748b;--apifn-accent:#7c3aed;--apifn-accent-text:#c4b5fd;--apifn-green:#6ee7b7;--apifn-blue:#93c5fd;--apifn-yellow:#fcd34d;--apifn-red:#fca5a5;--apifn-purple:#c4b5fd;--apifn-orange:#fdba74;--apifn-radius:6px;--apifn-font-mono:'JetBrains Mono',monospace;--apifn-font-sans:-apple-system,sans-serif`;
    const light = `--apifn-bg:#ffffff;--apifn-bg-surface:#f8fafc;--apifn-bg-surface-hover:#f1f5f9;--apifn-border:#e2e8f0;--apifn-text:#0f172a;--apifn-text-muted:#64748b;--apifn-accent:#7c3aed;--apifn-accent-text:#6d28d9;--apifn-green:#059669;--apifn-blue:#2563eb;--apifn-yellow:#d97706;--apifn-red:#dc2626;--apifn-purple:#7c3aed;--apifn-orange:#ea580c;--apifn-radius:6px;--apifn-font-mono:'JetBrains Mono',monospace;--apifn-font-sans:-apple-system,sans-serif`;
    if (t === "dark") return dark;
    if (t === "light") return light;
    return "";
  }

  $: endpoints = collectEndpoints(spec);
  $: info = spec.info as { title?: string; version?: string } | undefined;
  $: effectiveBaseUrl = baseUrl ?? (spec as { servers?: Array<{ url: string }> }).servers?.[0]?.url ?? "https://api.example.com";

  let query = "";
  let selected: EndpointItem | null = null;
  let tab: "docs" | "tryit" | "history" = "docs";
  let sidebarOpen = true;
  let isMobile = false;
  let history: HistoryEntry[] = [];
  let metrics: Record<string, EndpointMetrics> = {};

  $: filtered = query
    ? endpoints.filter((e) =>
        e.path.toLowerCase().includes(query.toLowerCase()) ||
        e.method.toLowerCase().includes(query.toLowerCase()) ||
        ((e.operation.summary as string) ?? "").toLowerCase().includes(query.toLowerCase())
      )
    : endpoints;

  $: grouped = (() => {
    const map = new Map<string, EndpointItem[]>();
    for (const e of filtered) {
      if (!map.has(e.tag)) map.set(e.tag, []);
      map.get(e.tag)!.push(e);
    }
    return map;
  })();

  onMount(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    isMobile = mq.matches;
    sidebarOpen = !mq.matches;
    const handler = (e: MediaQueryListEvent) => {
      isMobile = e.matches;
      sidebarOpen = !e.matches;
    };
    mq.addEventListener("change", handler);

    let mounted = true;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      if (!watchfn || !mounted) return;
      try {
        const list = await watchfn.fetchMetrics({ timeRange: "PT1H" });
        if (!mounted) return;
        const m: Record<string, EndpointMetrics> = {};
        for (const item of list) {
          m[`${item.method.toUpperCase()} ${item.path}`] = item;
        }
        metrics = m;
      } catch (err) {
        console.warn("[ApiExplorer] Failed to fetch watchfn metrics:", err);
      }
      if (mounted) {
        timer = setTimeout(poll, watchfnInterval);
      }
    }

    if (watchfn) poll();

    return () => {
      mounted = false;
      clearTimeout(timer);
      mq.removeEventListener("change", handler);
    };
  });

  function selectEndpoint(item: EndpointItem) {
    selected = item;
    tab = "docs";
    if (isMobile) sidebarOpen = false;
  }

  function handleResponse(e: CustomEvent) {
    if (!selected) return;
    const r = e.detail;
    history = [{
      id: `${Date.now()}-${Math.random()}`,
      timestamp: Date.now(),
      method: selected.method,
      url: `${effectiveBaseUrl}${selected.path}`,
      statusCode: r.statusCode,
      duration: r.durationMs,
      responseBody: r.body,
      responseHeaders: r.headers,
    }, ...history].slice(0, 500);
  }

  function mc(method: string) {
    return METHOD_COLORS[method.toLowerCase()] ?? { bg: "#2d3748", text: "#9ca3af" };
  }

  $: themeVars = getThemeCSS(theme);
</script>

<div class="apifn-root" class:auto-theme={theme === "auto"} style={themeVars}>
  <!-- Top Bar -->
  <header class="topbar">
    <button
      class="hamburger"
      class:show={isMobile}
      on:click={() => (sidebarOpen = !sidebarOpen)}
      aria-label="Toggle sidebar"
    >☰</button>
    <span class="logo">ApiFn</span>
    <span class="api-title">{info?.title ?? "API Explorer"}</span>
    <span class="version">v{info?.version ?? "1.0.0"}</span>
  </header>

  <div class="body">
    <!-- Sidebar -->
    {#if sidebarOpen}
      <aside class="sidebar">
        <input
          class="search"
          placeholder="Search endpoints…"
          bind:value={query}
          aria-label="Search endpoints"
        />
        <div class="endpoint-list">
          {#if filtered.length === 0}
            <div class="empty-list">No endpoints match</div>
          {/if}
          {#each [...grouped.entries()] as [tag, items]}
            <div class="tag-group">
              <div class="tag-header">{tag}</div>
              {#each items as item}
                <div
                  class="endpoint-row"
                  class:active={selected?.path === item.path && selected?.method === item.method}
                  role="button"
                  tabindex="0"
                  on:click={() => selectEndpoint(item)}
                  on:keydown={(e) => e.key === "Enter" && selectEndpoint(item)}
                >
                  <span class="method-tag" style="background:{mc(item.method).bg};color:{mc(item.method).text}">
                    {item.method.toUpperCase()}
                  </span>
                  <span class="ep-path">{item.path}</span>
                  {#if metrics[`${item.method.toUpperCase()} ${item.path}`]}
                    <span class="perf-badge" title="Performance data available">⚡</span>
                  {/if}
                  {#if rateLimits && rateLimits[`${item.method.toUpperCase()} ${item.path}`]}
                    {@const rl = rateLimits[`${item.method.toUpperCase()} ${item.path}`]}
                    <span class="rl-badge" style="color: {rl.remaining / rl.limit < 0.1 ? 'var(--apifn-red)' : 'var(--apifn-text-muted)'}" title={`Rate Limit: ${rl.remaining}/${rl.limit}`}>
                      {rl.remaining}/{rl.limit}
                    </span>
                  {/if}
                </div>
              {/each}
            </div>
          {/each}
        </div>
      </aside>
    {/if}

    <!-- Main -->
    <main class="main">
      {#if selected}
        <!-- Tabs -->
        <nav class="tabs">
          <button class="tab" class:active={tab === "docs"} on:click={() => (tab = "docs")}>Documentation</button>
          <button class="tab" class:active={tab === "tryit"} on:click={() => (tab = "tryit")}>Try It</button>
          {#if watchfn}
            <button class="tab" class:active={tab === "perf"} on:click={() => (tab = "perf" as any)}>Performance</button>
          {/if}
          {#if showHistory}
            <button class="tab" class:active={tab === "history"} on:click={() => (tab = "history")}>History</button>
          {/if}
        </nav>

        <div class="content">
          {#if tab === "docs"}
            <EndpointViewer path={selected.path} method={selected.method} operation={selected.operation} />
          {:else if tab === "tryit"}
            <TryIt path={selected.path} method={selected.method} operation={selected.operation} baseUrl={effectiveBaseUrl} on:response={handleResponse} />
          {:else if tab === "perf" && watchfn}
            <div style="padding: 20px;">
              {#if metrics[`${selected.method.toUpperCase()} ${selected.path}`]}
                {@const raw = metrics[`${selected.method.toUpperCase()} ${selected.path}`]}
                <PerformanceOverlay metrics={{
                  endpoint: selected.path,
                  method: selected.method,
                  p50Ms: raw.latency.p50,
                  p95Ms: raw.latency.p95,
                  p99Ms: raw.latency.p99,
                  errorRatePct: raw.errors.rate * 100,
                  requestsPerMinute: raw.throughput.rpm,
                  lastUpdated: raw.lastUpdated
                }} />
              {:else}
                <div class="empty-main" style="height: auto;">No performance data available yet.</div>
              {/if}
            </div>
          {:else if tab === "history" && showHistory}
            <RequestHistory entries={history} on:clear={() => (history = [])} />
          {/if}
        </div>
      {:else}
        <div class="empty-main">
          <div class="empty-icon">⚡</div>
          <div>Select an endpoint from the sidebar</div>
        </div>
      {/if}
    </main>
  </div>
</div>

<style>
  .apifn-root {
    --apifn-bg:#ffffff;--apifn-bg-surface:#f8fafc;--apifn-bg-surface-hover:#f1f5f9;
    --apifn-border:#e2e8f0;--apifn-text:#0f172a;--apifn-text-muted:#64748b;
    --apifn-accent:#7c3aed;--apifn-accent-text:#6d28d9;--apifn-green:#059669;
    --apifn-blue:#2563eb;--apifn-yellow:#d97706;--apifn-red:#dc2626;
    --apifn-purple:#7c3aed;--apifn-orange:#ea580c;--apifn-radius:6px;
    --apifn-font-mono:'JetBrains Mono',monospace;--apifn-font-sans:-apple-system,sans-serif;
    font-family: var(--apifn-font-sans, sans-serif);
    background: var(--apifn-bg, #0f1117);
    color: var(--apifn-text, #e2e8f0);
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
  }
  @media (prefers-color-scheme: dark) {
    .apifn-root.auto-theme {
      --apifn-bg: #0f1117; --apifn-bg-surface: #1a1d2e; --apifn-bg-surface-hover: #252840;
      --apifn-border: #2d3748; --apifn-text: #e2e8f0; --apifn-text-muted: #64748b;
      --apifn-accent: #7c3aed; --apifn-accent-text: #c4b5fd; --apifn-green: #6ee7b7;
      --apifn-blue: #93c5fd; --apifn-yellow: #fcd34d; --apifn-red: #fca5a5;
    }
  }
  .topbar { display: flex; align-items: center; gap: 12px; padding: 0 20px; height: 52px; border-bottom: 1px solid var(--apifn-border); background: var(--apifn-bg-surface); flex-shrink: 0; }
  .logo { font-size: 16px; font-weight: 800; color: var(--apifn-accent); letter-spacing: -.5px; }
  .api-title { font-size: 14px; color: var(--apifn-text-muted); flex: 1; }
  .version { font-size: 11px; padding: 2px 8px; border-radius: 12px; background: var(--apifn-accent, #7c3aed)22; color: var(--apifn-accent-text); border: 1px solid var(--apifn-accent, #7c3aed)44; }
  .hamburger { background: none; border: none; color: var(--apifn-text); cursor: pointer; font-size: 20px; padding: 4px; display: none; }
  .hamburger.show { display: block; }
  .body { display: flex; flex: 1; overflow: hidden; }
  .sidebar { width: 280px; min-width: 280px; border-right: 1px solid var(--apifn-border); background: var(--apifn-bg-surface); display: flex; flex-direction: column; overflow: hidden; flex-shrink: 0; }
  .search { margin: 12px; padding: 8px 12px; background: var(--apifn-bg); border: 1px solid var(--apifn-border); border-radius: var(--apifn-radius); color: var(--apifn-text); font-size: 13px; outline: none; width: calc(100% - 24px); box-sizing: border-box; }
  .endpoint-list { flex: 1; overflow-y: auto; padding: 4px 0; }
  .empty-list { padding: 20px; color: var(--apifn-text-muted); font-size: 13px; text-align: center; }
  .tag-group { margin-bottom: 4px; }
  .tag-header { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--apifn-text-muted); padding: 8px 12px 4px; }
  .endpoint-row { display: flex; align-items: center; gap: 8px; padding: 7px 12px; cursor: pointer; border-left: 2px solid transparent; transition: background .1s; }
  .endpoint-row:hover { background: var(--apifn-bg-surface-hover); }
  .endpoint-row.active { background: var(--apifn-bg-surface-hover); border-left-color: var(--apifn-accent); }
  .method-tag { font-size: 10px; font-weight: 700; padding: 1px 5px; border-radius: 3px; font-family: var(--apifn-font-mono); min-width: 40px; text-align: center; text-transform: uppercase; }
  .ep-path { font-family: var(--apifn-font-mono); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .perf-badge { font-size: 11px; font-weight: 600; padding: 2px 8px; background: var(--apifn-bg-surface-hover); border-radius: 12px; color: var(--apifn-text-muted); }
  .rl-badge { font-size: 10px; font-weight: 600; padding: 2px 6px; background: var(--apifn-bg-surface); border: 1px solid var(--apifn-border); border-radius: 4px; color: var(--apifn-text-muted); white-space: nowrap; }
  .main { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
  .tabs { display: flex; border-bottom: 1px solid var(--apifn-border); background: var(--apifn-bg-surface); padding: 0 20px; flex-shrink: 0; }
  .tab { padding: 12px 16px; font-size: 13px; font-weight: 400; color: var(--apifn-text-muted); border: none; border-bottom: 2px solid transparent; cursor: pointer; background: none; transition: color .1s; }
  .tab.active { font-weight: 600; color: var(--apifn-text); border-bottom-color: var(--apifn-accent); }
  .content { flex: 1; overflow-y: auto; }
  .empty-main { display: flex; align-items: center; justify-content: center; height: 100%; flex-direction: column; gap: 12px; color: var(--apifn-text-muted); font-size: 14px; }
  .empty-icon { font-size: 32px; }
  @media (max-width: 768px) {
    .hamburger { display: block !important; }
    .sidebar { position: absolute; z-index: 100; height: 100%; }
  }
</style>
