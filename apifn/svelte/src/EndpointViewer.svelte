<!-- EndpointViewer.svelte — single endpoint documentation (UI-S-002) -->
<script lang="ts">
  import type { OperationObject, SchemaObject } from "@apifn/core";
  import SchemaViewer from "./SchemaViewer.svelte";

  export let path: string;
  export let method: string;
  export let operation: OperationObject;

  const METHOD_COLORS: Record<string, { bg: string; text: string }> = {
    get:     { bg: "#065f46", text: "#6ee7b7" },
    post:    { bg: "#1e3a5f", text: "#93c5fd" },
    put:     { bg: "#78350f", text: "#fcd34d" },
    patch:   { bg: "#5b21b6", text: "#c4b5fd" },
    delete:  { bg: "#7f1d1d", text: "#fca5a5" },
    head:    { bg: "#1f2937", text: "#9ca3af" },
    options: { bg: "#1f2937", text: "#9ca3af" },
  };

  function statusColor(code: string): string {
    const n = parseInt(code, 10);
    if (n >= 500) return "var(--apifn-red)";
    if (n >= 400) return "var(--apifn-orange, #fdba74)";
    if (n >= 300) return "var(--apifn-yellow)";
    if (n >= 200) return "var(--apifn-green)";
    return "var(--apifn-text-muted)";
  }

  $: mc = METHOD_COLORS[method.toLowerCase()] ?? { bg: "#2d3748", text: "#9ca3af" };
  $: params = (operation.parameters ?? []) as Array<{
    name: string; in: string; required?: boolean;
    description?: string; schema?: SchemaObject;
  }>;
  $: reqBody = operation.requestBody as {
    required?: boolean; content?: Record<string, { schema?: SchemaObject }>;
  } | undefined;
  $: reqSchema = reqBody?.content?.["application/json"]?.schema;
  $: responses = operation.responses ?? {};
  $: responseCodes = Object.keys(responses);

  let activeCode = responseCodes[0] ?? "200";

  $: activeResponse = responses[activeCode] as {
    description?: string; content?: Record<string, { schema?: SchemaObject }>;
  } | undefined;
  $: responseSchema = activeResponse?.content?.["application/json"]?.schema;
</script>

<div class="container">
  <div class="header">
    <span class="method-badge" style="background:{mc.bg};color:{mc.text}">{method.toUpperCase()}</span>
    <span class="path">{path}</span>
    {#if operation.deprecated}
      <span class="badge-yellow">deprecated</span>
    {/if}
  </div>

  {#if operation.summary}
    <div class="summary">{operation.summary}</div>
  {/if}
  {#if operation.description}
    <div class="description">{operation.description}</div>
  {/if}

  <!-- Parameters -->
  {#if params.length > 0}
    <div class="section">
      <div class="section-title">Parameters</div>
      <table>
        <thead>
          <tr>
            <th>Name</th><th>In</th><th>Type</th><th>Required</th><th>Description</th>
          </tr>
        </thead>
        <tbody>
          {#each params as p}
            <tr>
              <td class="mono accent">{p.name}</td>
              <td><span class="badge-muted">{p.in}</span></td>
              <td class="mono small">{(p.schema?.type as string) ?? "string"}</td>
              <td>{#if p.required}<span class="badge-red">✓</span>{/if}</td>
              <td class="muted small">{p.description ?? ""}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  <!-- Request Body -->
  {#if reqSchema}
    <div class="section">
      <div class="section-title">
        Request Body {#if reqBody?.required}<span class="red">*</span>{/if}
      </div>
      <div class="schema-box">
        <SchemaViewer schema={reqSchema} />
      </div>
    </div>
  {/if}

  <!-- Responses -->
  {#if responseCodes.length > 0}
    <div class="section">
      <div class="section-title">Responses</div>
      <div class="response-tabs">
        {#each responseCodes as code}
          <button
            class="response-tab"
            class:active={code === activeCode}
            on:click={() => (activeCode = code)}
            style="color:{statusColor(code)}"
          >{code}</button>
        {/each}
      </div>
      <div class="schema-box">
        {#if activeResponse?.description}
          <div class="muted small" style="margin-bottom:8px">{activeResponse.description}</div>
        {/if}
        {#if responseSchema}
          <SchemaViewer schema={responseSchema} />
        {:else}
          <span class="muted small">No response body schema defined.</span>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .container { padding: 24px; color: var(--apifn-text); font-family: var(--apifn-font-sans); }
  .header { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 20px; }
  .method-badge { padding: 4px 12px; border-radius: 4px; font-weight: 700; font-size: 13px; font-family: var(--apifn-font-mono); text-transform: uppercase; letter-spacing: .05em; }
  .path { font-family: var(--apifn-font-mono); font-size: 18px; font-weight: 600; }
  .summary { font-size: 15px; color: var(--apifn-text-muted); margin-bottom: 8px; }
  .description { font-size: 14px; color: var(--apifn-text-muted); line-height: 1.6; margin-bottom: 24px; }
  .section { margin-bottom: 24px; }
  .section-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--apifn-text-muted); margin-bottom: 12px; border-bottom: 1px solid var(--apifn-border); padding-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; padding: 6px 8px; color: var(--apifn-text-muted); font-weight: 600; font-size: 12px; border-bottom: 1px solid var(--apifn-border); }
  td { padding: 8px; border-bottom: 1px solid var(--apifn-border); vertical-align: top; }
  .mono { font-family: var(--apifn-font-mono); }
  .accent { color: var(--apifn-accent-text); }
  .small { font-size: 12px; }
  .muted { color: var(--apifn-text-muted); }
  .red { color: var(--apifn-red); }
  .schema-box { background: var(--apifn-bg-surface); border: 1px solid var(--apifn-border); border-radius: var(--apifn-radius); padding: 16px; }
  .badge-muted { font-size: 11px; padding: 1px 6px; border-radius: 3px; background: #2d374844; color: var(--apifn-text-muted); border: 1px solid var(--apifn-border); }
  .badge-yellow { font-size: 11px; padding: 1px 6px; border-radius: 3px; background: #78350f22; color: var(--apifn-yellow); border: 1px solid #78350f44; }
  .badge-red { font-size: 11px; padding: 1px 6px; border-radius: 3px; background: #7f1d1d22; color: var(--apifn-red); border: 1px solid #7f1d1d44; }
  .response-tabs { display: flex; gap: 2px; flex-wrap: wrap; margin-bottom: 0; }
  .response-tab { padding: 6px 14px; border-radius: 4px 4px 0 0; border: 1px solid var(--apifn-border); border-bottom: none; background: transparent; color: var(--apifn-text-muted); cursor: pointer; font-size: 13px; font-family: var(--apifn-font-mono); }
  .response-tab.active { background: var(--apifn-bg-surface); color: var(--apifn-text); }
</style>
