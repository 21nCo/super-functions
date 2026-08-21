<script lang="ts">
  import { CardContent, CardDescription, CardHeader, CardRoot, CardTitle } from '@uifn/components-svelte/card';
  import StatusBadge from './StatusBadge.svelte';
  import type { MetricViewModel } from './view-models';

  let { metric }: { metric: MetricViewModel } = $props();
</script>

<CardRoot class="metric-card">
  <CardHeader>
    <CardDescription>{metric.label}</CardDescription>
    {#if metric.trend}<StatusBadge label={metric.trend} tone={metric.tone ?? 'neutral'} />{/if}
  </CardHeader>
  <CardContent>
    <CardTitle class="metric-card__value">{metric.value}</CardTitle>
    {#if metric.detail}<p>{metric.detail}</p>{/if}
  </CardContent>
</CardRoot>
