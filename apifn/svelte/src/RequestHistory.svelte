<!-- RequestHistory.svelte — list of past requests (UI-S-005) -->
<script lang="ts">
  import { createEventDispatcher } from "svelte";

  export interface HistoryEntry {
    id: string; timestamp: number; method: string; url: string;
    statusCode?: number; duration?: number;
    requestBody?: unknown; responseBody?: unknown;
    responseHeaders?: Record<string, string>; error?: string;
  }
  export let entries: HistoryEntry[] = [];
  export let maxEntries: number = 500;

  const dispatch = createEventDispatcher<{ select: HistoryEntry; clear: void }>();

  const METHOD_COLORS: Record<string, { bg: string; text: string }> = {
    get: { bg: "#065f46", text: "#6ee7b7" }, post: { bg: "#1e3a5f", text: "#93c5fd" },
    put: { bg: "#78350f", text: "#fcd34d" }, patch: { bg: "#5b21b6", text: "#c4b5fd" },
    delete: { bg: "#7f1d1d", text: "#fca5a5" },
  };

  $: visible = entries.slice(0, maxEntries).sort((a, b) => b.timestamp - a.timestamp);
  let selected: string | null = null;

  function statusColor(code?: number): string {
    if (!code) return "var(--apifn-text-muted)";
    if (code >= 200 && code < 300) return "var(--apifn-green)";
    if (code >= 400) return "var(--apifn-red)";
    return "var(--apifn-yellow)";
  }

  function mc(method: string) {
    return METHOD_COLORS[method.toLowerCase()] ?? { bg: "#2d3748", text: "#9ca3af" };
  }

  function toggleSelect(entry: HistoryEntry) {
    selected = selected === entry.id ? null : entry.id;
    dispatch("select", entry);
  }

  function clearHistory() { dispatch("clear"); }

  $: selectedEntry = visible.find((e) => e.id === selected) ?? null;
</script>

<div class="container">
  <div class="header">
    <span class="title">Request History ({visible.length})</span>
    <button class="clear-btn" on:click={clearHistory}>Clear</button>
  </div>

  {#if visible.length === 0}
    <div class="empty">No requests yet</div>
  {/if}

  {#each visible as entry}
    <div
      class="entry"
      class:active={entry.id === selected}
      role="button"
      tabindex="0"
      on:click={() => toggleSelect(entry)}
      on:keydown={(e) => e.key === "Enter" && toggleSelect(entry)}
    >
      <span class="method-tag" style="background:{mc(entry.method).bg};color:{mc(entry.method).text}">
        {entry.method.toUpperCase()}
      </span>
      <span class="url">{entry.url}</span>
      {#if entry.statusCode}
        <span class="status" style="color:{statusColor(entry.statusCode)}">{entry.statusCode}</span>
      {/if}
      {#if entry.duration !== undefined}
        <span class="duration">{entry.duration}ms</span>
      {/if}
      {#if entry.error}<span class="err-icon">✖</span>{/if}
    </div>

    {#if entry.id === selected && selectedEntry}
      <div class="detail">
        <div class="timestamp">{new Date(selectedEntry.timestamp).toLocaleString()}</div>
        {#if selectedEntry.error}
          <div class="error">{selectedEntry.error}</div>
        {/if}
        {#if selectedEntry.requestBody !== undefined}
          <div class="detail-section">
            <div class="detail-label">REQUEST BODY</div>
            <pre>{JSON.stringify(selectedEntry.requestBody, null, 2)}</pre>
          </div>
        {/if}
        {#if selectedEntry.responseBody !== undefined}
          <div class="detail-section">
            <div class="detail-label">RESPONSE BODY</div>
            <pre>{typeof selectedEntry.responseBody === "string" ? selectedEntry.responseBody : JSON.stringify(selectedEntry.responseBody, null, 2)}</pre>
          </div>
        {/if}
      </div>
    {/if}
  {/each}
</div>

<style>
  .container { font-family: var(--apifn-font-sans); color: var(--apifn-text); font-size: 13px; }
  .header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid var(--apifn-border); }
  .title { font-weight: 700; font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: var(--apifn-text-muted); }
  .clear-btn { background: none; border: 1px solid var(--apifn-border); border-radius: var(--apifn-radius); padding: 3px 10px; color: var(--apifn-text-muted); font-size: 12px; cursor: pointer; }
  .empty { padding: 32px; text-align: center; color: var(--apifn-text-muted); }
  .entry { display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-bottom: 1px solid var(--apifn-border); cursor: pointer; transition: background .1s; }
  .entry:hover, .entry.active { background: var(--apifn-bg-surface-hover); }
  .method-tag { font-size: 11px; font-weight: 700; padding: 1px 6px; border-radius: 3px; font-family: var(--apifn-font-mono); min-width: 46px; text-align: center; }
  .url { flex: 1; font-family: var(--apifn-font-mono); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .status { font-size: 12px; font-weight: 700; }
  .duration { font-size: 11px; color: var(--apifn-text-muted); min-width: 50px; text-align: right; }
  .err-icon { color: var(--apifn-red); font-size: 12px; }
  .detail { padding: 16px; background: var(--apifn-bg-surface); border-bottom: 1px solid var(--apifn-border); }
  .timestamp { font-size: 12px; color: var(--apifn-text-muted); margin-bottom: 8px; }
  .error { color: var(--apifn-red); margin-bottom: 8px; }
  .detail-section { margin-bottom: 8px; }
  .detail-label { font-size: 11px; font-weight: 700; color: var(--apifn-text-muted); margin-bottom: 4px; }
  pre { font-family: var(--apifn-font-mono); font-size: 12px; white-space: pre-wrap; word-break: break-all; color: var(--apifn-text); margin: 0; }
</style>
