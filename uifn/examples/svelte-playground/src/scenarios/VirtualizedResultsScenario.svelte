<script lang="ts">
  import {
    Badge,
    ScrollArea,
    ScrollAreaCorner,
    ScrollAreaScrollbar,
    ScrollAreaThumb,
    ScrollAreaViewport,
    VirtualizedList,
  } from "@uifn/svelte";
  import { resultRows, type ExampleRouteHash } from "@uifn/examples-shared";

  export let route: ExampleRouteHash;

  const categoryCounts = [
    { category: "alerts", total: resultRows.filter((row) => row.category === "alerts").length },
    { category: "changes", total: resultRows.filter((row) => row.category === "changes").length },
    { category: "events", total: resultRows.filter((row) => row.category === "events").length },
  ];
</script>

<div class="scenario-stack" data-route={route}>
  <div class="results-summary">
    <div>
      <p class="section-label">Windowed rendering</p>
      <h3>Virtualized dataset</h3>
    </div>
    <p class="scenario-description">
      The Svelte adapter keeps the logical result set at 120 rows while mounting only a visible
      window inside the virtualized viewport.
    </p>
  </div>

  <div class="results-layout">
    <aside class="results-shell">
      <h4>Category totals</h4>
      <ScrollArea class="stats-scroll">
        <ScrollAreaViewport class="stats-scroll-viewport">
          <ul class="stats-list">
            {#each categoryCounts as entry (entry.category)}
              <li>
                <span>{entry.category}</span>
                <Badge class="adapter-badge subtle">{entry.total}</Badge>
              </li>
            {/each}
          </ul>
        </ScrollAreaViewport>
        <ScrollAreaScrollbar orientation="vertical" class="scrollbar">
          <ScrollAreaThumb class="scrollbar-thumb" />
        </ScrollAreaScrollbar>
        <ScrollAreaCorner />
      </ScrollArea>
    </aside>

    <section class="virtualized-frame">
      <VirtualizedList items={resultRows} itemHeight={48} height={336} class="virtualized-viewport">
        {#snippet children(row, index)}
          <button
            type="button"
            class="virtualized-row"
            aria-label={row.label}
            data-row-index={index}
          >
            <span>{row.label}</span>
            <small>{row.category}</small>
          </button>
        {/snippet}
      </VirtualizedList>
    </section>
  </div>
</div>
