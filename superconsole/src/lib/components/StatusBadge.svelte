<script lang="ts">
  import { BadgeRoot } from '@uifn/components-svelte/badge';
  import { statusTone, type ResourceTone } from './view-models';

  let {
    status,
    tone,
    label,
  }: { status?: string; tone?: ResourceTone; label?: string } = $props();

  const resolvedTone = $derived(tone ?? statusTone(status));
  const text = $derived(label ?? status ?? 'Unknown');
</script>

<BadgeRoot
  variant={resolvedTone === 'success' ? 'success' : resolvedTone === 'danger' ? 'destructive' : resolvedTone === 'neutral' ? 'secondary' : 'outline'}
  class={`status-badge status-badge--${resolvedTone}`}
>
  <span class="status-badge__dot" aria-hidden="true"></span>
  {text}
</BadgeRoot>
