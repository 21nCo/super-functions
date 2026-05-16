<!-- PerformanceOverlay.svelte — watchfn metrics display (UI-S-007) -->
<script lang="ts">
  export interface PerformanceMetrics {
    endpoint: string; method: string;
    p50Ms: number; p95Ms: number; p99Ms: number;
    errorRatePct: number; requestsPerMinute: number; lastUpdated: string;
  }
  export let metrics: PerformanceMetrics;
  export let compact: boolean = false;

  const P99_CEIL = 2000;
  const RPM_CEIL = 1000;

  function barPct(val: number, ceil: number): number { return Math.min(100, (val / ceil) * 100); }

  $: errorHigh = metrics.errorRatePct > 5;
  $: latencyBars = [
    { label: `p50 — ${metrics.p50Ms}ms`, val: metrics.p50Ms, color: "var(--apifn-green)" },
    { label: `p95 — ${metrics.p95Ms}ms`, val: metrics.p95Ms, color: "var(--apifn-yellow)" },
    { label: `p99 — ${metrics.p99Ms}ms`, val: metrics.p99Ms, color: metrics.p99Ms > 1000 ? "var(--apifn-red)" : "var(--apifn-blue)" },
  ];
</script>

{#if compact}
  <div class="compact">
    <span>p50 <strong>{metrics.p50Ms}ms</strong></span>
    <span>p99 <strong style="color:{errorHigh ? 'var(--apifn-red)' : 'inherit'}">{metrics.p99Ms}ms</strong></span>
    <span>err <strong style="color:{errorHigh ? 'var(--apifn-red)' : 'inherit'}">{metrics.errorRatePct.toFixed(1)}%</strong></span>
    <span>{metrics.requestsPerMinute} rpm</span>
  </div>
{:else}
  <div class="container">
    <div class="title">
      <span>⚡ Performance</span>
      <span class="endpoint">{metrics.method.toUpperCase()} {metrics.endpoint}</span>
    </div>

    <!-- KPI grid -->
    <div class="grid">
      <div class="metric">
        <div class="metric-label">p50 Latency</div>
        <div class="metric-value">{metrics.p50Ms}<span class="unit">ms</span></div>
      </div>
      <div class="metric">
        <div class="metric-label">p99 Latency</div>
        <div class="metric-value" style="color:{metrics.p99Ms > 1000 ? 'var(--apifn-red)' : 'inherit'}">{metrics.p99Ms}<span class="unit">ms</span></div>
      </div>
      <div class="metric">
        <div class="metric-label">Error Rate</div>
        <div class="metric-value" style="color:{errorHigh ? 'var(--apifn-red)' : 'inherit'}">{metrics.errorRatePct.toFixed(1)}<span class="unit">%</span></div>
      </div>
    </div>

    <!-- Latency bars -->
    {#each latencyBars as bar}
      <div class="bar-row">
        <div class="bar-label"><span>{bar.label}</span></div>
        <div class="bar-track">
          <div class="bar-fill" style="width:{barPct(bar.val, P99_CEIL)}%;background:{bar.color}"></div>
        </div>
      </div>
    {/each}

    <!-- Throughput -->
    <div class="bar-row" style="margin-top:8px">
      <div class="bar-label"><span>Throughput</span><span>{metrics.requestsPerMinute} rpm</span></div>
      <div class="bar-track">
        <div class="bar-fill" style="width:{barPct(metrics.requestsPerMinute, RPM_CEIL)}%;background:var(--apifn-accent)"></div>
      </div>
    </div>

    <div class="footer">Last updated: {new Date(metrics.lastUpdated).toLocaleTimeString()}</div>
  </div>
{/if}

<style>
  .compact { display: flex; gap: 12px; align-items: center; font-size: 12px; font-family: var(--apifn-font-mono); color: var(--apifn-text-muted); }
  .container { background: var(--apifn-bg-surface); border: 1px solid var(--apifn-border); border-radius: var(--apifn-radius); padding: 16px; font-family: var(--apifn-font-sans); color: var(--apifn-text); }
  .title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--apifn-text-muted); margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between; }
  .endpoint { font-weight: 400; font-size: 11px; }
  .grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 12px; margin-bottom: 16px; }
  .metric { background: var(--apifn-bg); border: 1px solid var(--apifn-border); border-radius: var(--apifn-radius); padding: 10px 12px; }
  .metric-label { font-size: 11px; color: var(--apifn-text-muted); margin-bottom: 4px; }
  .metric-value { font-size: 20px; font-weight: 700; font-family: var(--apifn-font-mono); }
  .unit { font-size: 12px; color: var(--apifn-text-muted); margin-left: 2px; }
  .bar-row { margin-bottom: 8px; }
  .bar-label { display: flex; justify-content: space-between; font-size: 12px; color: var(--apifn-text-muted); margin-bottom: 3px; }
  .bar-track { height: 6px; background: var(--apifn-border); border-radius: 3px; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 3px; transition: width .4s ease; }
  .footer { font-size: 11px; color: var(--apifn-text-muted); border-top: 1px solid var(--apifn-border); padding-top: 8px; margin-top: 8px; }
</style>
