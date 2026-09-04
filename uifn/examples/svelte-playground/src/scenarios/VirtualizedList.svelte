<script lang="ts">
  import type { Snippet } from "svelte";

  type Item = { label: string; category: string };

  export let items: Item[] = [];
  export let itemHeight = 48;
  export let height = 336;
  export let children: Snippet<[Item, number]> | undefined = undefined;
  let className = "";
  export { className as class };
</script>

<div class={className} style={`height:${height}px;overflow:auto`}>
  {#each items as item, index}
    <div style={`min-height:${itemHeight}px`}>
      {@render children?.(item, index)}
    </div>
  {/each}
</div>
