<script lang="ts">
  import '@uifn/components/styles.css';
  import '../app.css';
  import OperatorShell from '$lib/components/OperatorShell.svelte';
  import type { LayoutData } from './$types';
  import type { Snippet } from 'svelte';

  let { data, children }: { data: LayoutData; children: Snippet } = $props();
</script>

<OperatorShell shell={data.shell} {children} />
