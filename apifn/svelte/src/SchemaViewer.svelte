<!-- SchemaViewer.svelte — renders a JSON Schema as a collapsible tree (UI-S-003) -->
<script lang="ts">
  import type { SchemaObject } from "@apifn/core";
  import SchemaViewer from "./SchemaViewer.svelte";

  export let schema: SchemaObject;
  export let name: string | undefined = undefined;
  export let required: boolean = false;
  export let expandDepth: number = 2;
  export let depth: number = 0;

  const schemaType = schema.type as string | string[] | undefined;
  const primaryType: string = Array.isArray(schemaType)
    ? (schemaType[0] ?? "object")
    : schemaType ?? "object";

  const hasChildren =
    primaryType === "object" &&
    typeof schema.properties === "object" &&
    schema.properties !== null;
  const isArray = primaryType === "array";
  const itemSchema = schema.items as SchemaObject | undefined;

  let expanded = depth < expandDepth;

  function typeColor(type: string): string {
    const map: Record<string, string> = {
      string: "var(--apifn-green)",
      integer: "var(--apifn-blue)",
      number: "var(--apifn-blue)",
      boolean: "var(--apifn-yellow)",
      array: "var(--apifn-purple)",
    };
    return map[type] ?? "var(--apifn-text-muted)";
  }

  function typeBg(type: string): string {
    const map: Record<string, string> = {
      string: "#065f4622",
      integer: "#1e3a5f22",
      number: "#1e3a5f22",
      boolean: "#78350f22",
      array: "#5b21b622",
    };
    return map[type] ?? "#2d3748";
  }

  $: requiredFields = (schema.required ?? []) as string[];
  $: properties = hasChildren
    ? Object.entries(schema.properties as Record<string, unknown>)
    : [];
</script>

<div class="schema-node">
  <!-- Row -->
  <div
    class="schema-row"
    role="button"
    tabindex="0"
    on:click={() => hasChildren && (expanded = !expanded)}
    on:keydown={(e) => e.key === "Enter" && hasChildren && (expanded = !expanded)}
  >
    <span class="toggle">{hasChildren ? (expanded ? "▾" : "▸") : " "}</span>
    {#if name}<span class="prop-name">{name}</span>{/if}
    {#if required}<span class="required">required</span>{/if}
    <span
      class="type-badge"
      style="color:{typeColor(primaryType)};background:{typeBg(primaryType)};border:1px solid {typeColor(primaryType)}44"
    >{primaryType}</span>
    {#if isArray && itemSchema}
      <span class="type-badge" style="opacity:0.6;color:var(--apifn-text-muted);background:#2d3748">
        of {(itemSchema.type as string) ?? "object"}
      </span>
    {/if}
    {#if typeof schema.description === "string"}
      <span class="description">{schema.description}</span>
    {/if}
    {#if Array.isArray(schema.enum)}
      <span class="description">enum: {(schema.enum as unknown[]).map(String).join(" | ")}</span>
    {/if}
  </div>

  <!-- Object properties -->
  {#if hasChildren && expanded}
    <div class="children">
      {#each properties as [propName, propSchema]}
        <svelte:self
          schema={propSchema}
          name={propName}
          required={requiredFields.includes(propName)}
          {expandDepth}
          depth={depth + 1}
        />
      {/each}
    </div>
  {/if}

  <!-- Array items -->
  {#if isArray && itemSchema && expanded && typeof itemSchema.properties === "object" && itemSchema.properties !== null}
    <div class="children">
      <svelte:self schema={itemSchema} name="items" {expandDepth} depth={depth + 1} />
    </div>
  {/if}
</div>

<style>
  .schema-node {
    font-family: var(--apifn-font-mono, monospace);
    font-size: 13px;
    line-height: 1.6;
  }
  .schema-row {
    display: flex;
    align-items: baseline;
    gap: 6px;
    padding: 2px 0;
    cursor: pointer;
  }
  .toggle {
    color: var(--apifn-text-muted);
    user-select: none;
    width: 14px;
    flex-shrink: 0;
  }
  .prop-name { color: var(--apifn-accent); font-weight: 600; }
  .required { color: var(--apifn-red); font-size: 11px; font-weight: 700; }
  .type-badge {
    font-size: 11px;
    padding: 1px 6px;
    border-radius: 4px;
    opacity: 0.9;
  }
  .description { color: var(--apifn-text-muted); font-size: 12px; }
  .children {
    border-left: 1px solid var(--apifn-border);
    margin-left: 8px;
    padding-left: 12px;
  }
</style>
