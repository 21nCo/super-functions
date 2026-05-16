<!-- TryIt.svelte — interactive request builder and sender (UI-S-004) -->
<script lang="ts">
  import type { OperationObject } from "@apifn/core";

  export let path: string;
  export let method: string;
  export let operation: OperationObject;
  export let baseUrl: string = "https://api.example.com";

  // Dispatch
  import { createEventDispatcher } from "svelte";
  const dispatch = createEventDispatcher<{ response: { statusCode: number; statusText: string; headers: Record<string, string>; body: unknown; durationMs: number } }>();

  const METHOD_COLORS: Record<string, { bg: string; text: string }> = {
    get: { bg: "#065f46", text: "#6ee7b7" }, post: { bg: "#1e3a5f", text: "#93c5fd" },
    put: { bg: "#78350f", text: "#fcd34d" }, patch: { bg: "#5b21b6", text: "#c4b5fd" },
    delete: { bg: "#7f1d1d", text: "#fca5a5" },
  };
  $: mc = METHOD_COLORS[method.toLowerCase()] ?? { bg: "#2d3748", text: "#9ca3af" };

  $: params = (operation.parameters ?? []) as Array<{ name: string; in: string; required?: boolean }>;
  $: pathParams = params.filter((p) => p.in === "path");
  $: queryParams = params.filter((p) => p.in === "query");

  let pathValues: Record<string, string> = {};
  let queryValues: Record<string, string> = {};
  let body = "";
  let authType: "none" | "bearer" | "apikey" | "basic" = "none";
  let authToken = "";
  let authKey = "";
  let authUser = "";
  let authPass = "";
  let loading = false;
  let errorMsg: string | null = null;
  let response: { statusCode: number; statusText: string; headers: Record<string, string>; body: unknown; durationMs: number } | null = null;

  $: resolvedPath = path.replace(/\{([^}]+)\}/g, (_, n: string) => pathValues[n] ?? `{${n}}`);
  $: queryString = Object.entries(queryValues).filter(([, v]) => v).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
  $: url = `${baseUrl.replace(/\/$/, "")}${resolvedPath}${queryString ? "?" + queryString : ""}`;

  function statusColor(code: number): string {
    if (code >= 200 && code < 300) return "var(--apifn-green)";
    if (code >= 400) return "var(--apifn-red)";
    return "var(--apifn-yellow)";
  }

  async function sendRequest() {
    loading = true;
    errorMsg = null;
    const start = Date.now();
    try {
      const headers: Record<string, string> = {};
      if (authType === "bearer" && authToken) headers["Authorization"] = `Bearer ${authToken}`;
      if (authType === "apikey" && authKey) headers["X-API-Key"] = authKey;
      if (authType === "basic" && authUser) headers["Authorization"] = `Basic ${btoa(`${authUser}:${authPass}`)}`;
      let bodyArg: string | undefined;
      if (body.trim()) { headers["Content-Type"] = "application/json"; bodyArg = body; }
      const res = await fetch(url, { method: method.toUpperCase(), headers, body: bodyArg });
      const durationMs = Date.now() - start;
      const resHeaders: Record<string, string> = {};
      res.headers.forEach((v, k) => { resHeaders[k] = v; });
      const ct = res.headers.get("content-type") ?? "";
      const resBody = ct.includes("application/json") ? await res.json() : await res.text();
      response = { statusCode: res.status, statusText: res.statusText, headers: resHeaders, body: resBody, durationMs };
      dispatch("response", response);
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }
</script>

<div class="container">
  <!-- URL Bar -->
  <div class="row">
    <span class="method-badge" style="background:{mc.bg};color:{mc.text}">{method.toUpperCase()}</span>
    <input class="url-input" readonly value={url} />
    <button class="send-btn" on:click={sendRequest} disabled={loading}>
      {loading ? "Sending…" : "Send"}
    </button>
  </div>

  <!-- Path Params -->
  {#if pathParams.length > 0}
    <div class="section">
      <label class="label">Path Parameters</label>
      {#each pathParams as p}
        <div class="param-row">
          <span class="param-name">{p.name}</span>
          <input class="field" placeholder={`{${p.name}}`} bind:value={pathValues[p.name]} />
        </div>
      {/each}
    </div>
  {/if}

  <!-- Query Params -->
  {#if queryParams.length > 0}
    <div class="section">
      <label class="label">Query Parameters</label>
      {#each queryParams as p}
        <div class="param-row">
          <span class="param-name">{p.name}</span>
          <input class="field" placeholder={p.name} bind:value={queryValues[p.name]} />
        </div>
      {/each}
    </div>
  {/if}

  <!-- Auth -->
  <div class="section">
    <label class="label">Auth</label>
    <div class="row">
      <select class="select" bind:value={authType}>
        <option value="none">None</option>
        <option value="bearer">Bearer Token</option>
        <option value="apikey">API Key</option>
        <option value="basic">Basic Auth</option>
      </select>
      {#if authType === "bearer"}
        <input class="field" placeholder="Bearer token" bind:value={authToken} />
      {:else if authType === "apikey"}
        <input class="field" placeholder="API key" bind:value={authKey} />
      {:else if authType === "basic"}
        <input class="field" placeholder="Username" bind:value={authUser} style="width:140px;flex:none" />
        <input class="field" type="password" placeholder="Password" bind:value={authPass} style="width:140px;flex:none" />
      {/if}
    </div>
  </div>

  <!-- Body -->
  {#if ["post","put","patch"].includes(method.toLowerCase())}
    <div class="section">
      <label class="label">Request Body</label>
      <textarea class="textarea" bind:value={body} placeholder="{}" spellcheck="false" />
    </div>
  {/if}

  <!-- Error -->
  {#if errorMsg}
    <div class="error">{errorMsg}</div>
  {/if}

  <!-- Response -->
  {#if response}
    <div class="response-box">
      <div class="status-line" style="color:{statusColor(response.statusCode)}">
        {response.statusCode} {response.statusText}
        <span class="duration">{response.durationMs}ms</span>
      </div>
      <details>
        <summary>Response Headers ({Object.keys(response.headers).length})</summary>
        <pre>{Object.entries(response.headers).map(([k,v]) => `${k}: ${v}`).join("\n")}</pre>
      </details>
      <pre>{typeof response.body === "string" ? response.body : JSON.stringify(response.body, null, 2)}</pre>
    </div>
  {/if}
</div>

<style>
  .container { padding: 20px; font-family: var(--apifn-font-sans); color: var(--apifn-text); }
  .row { display: flex; gap: 8px; align-items: center; margin-bottom: 16px; }
  .method-badge { padding: 6px 12px; border-radius: 4px; font-weight: 700; font-size: 13px; font-family: var(--apifn-font-mono); flex-shrink: 0; }
  .url-input { flex: 1; background: var(--apifn-bg-surface); border: 1px solid var(--apifn-border); border-radius: var(--apifn-radius); padding: 8px 12px; color: var(--apifn-text); font-family: var(--apifn-font-mono); font-size: 13px; outline: none; }
  .send-btn { padding: 8px 20px; background: var(--apifn-accent); color: #fff; border: none; border-radius: var(--apifn-radius); font-size: 14px; font-weight: 600; cursor: pointer; flex-shrink: 0; }
  .send-btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .label { display: block; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--apifn-text-muted); margin-bottom: 6px; }
  .section { margin-bottom: 16px; }
  .param-row { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
  .param-name { width: 120px; font-family: var(--apifn-font-mono); font-size: 13px; color: var(--apifn-accent-text); }
  .field { flex: 1; background: var(--apifn-bg-surface); border: 1px solid var(--apifn-border); border-radius: var(--apifn-radius); padding: 8px 12px; color: var(--apifn-text); font-family: var(--apifn-font-mono); font-size: 13px; outline: none; }
  .select { background: var(--apifn-bg-surface); border: 1px solid var(--apifn-border); border-radius: var(--apifn-radius); padding: 6px 10px; color: var(--apifn-text); font-size: 13px; outline: none; cursor: pointer; }
  .textarea { width: 100%; background: var(--apifn-bg-surface); border: 1px solid var(--apifn-border); border-radius: var(--apifn-radius); padding: 10px 12px; color: var(--apifn-text); font-family: var(--apifn-font-mono); font-size: 13px; resize: vertical; outline: none; min-height: 100px; box-sizing: border-box; }
  .error { background: #7f1d1d22; border: 1px solid #7f1d1d; border-radius: var(--apifn-radius); padding: 10px 14px; color: var(--apifn-red); font-size: 13px; margin-bottom: 12px; }
  .response-box { background: var(--apifn-bg-surface); border: 1px solid var(--apifn-border); border-radius: var(--apifn-radius); padding: 16px; margin-top: 16px; }
  .status-line { font-weight: 700; font-size: 16px; margin-bottom: 8px; }
  .duration { font-size: 13px; font-weight: 400; color: var(--apifn-text-muted); margin-left: 12px; }
  details summary { cursor: pointer; color: var(--apifn-text-muted); font-size: 12px; margin-bottom: 4px; }
  pre { font-family: var(--apifn-font-mono); font-size: 12px; white-space: pre-wrap; word-break: break-all; color: var(--apifn-text); margin: 0; }
</style>
