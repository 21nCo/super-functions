<script lang="ts">
  import ResourceDetailPage from '$lib/components/ResourceDetailPage.svelte';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
</script>

<ResourceDetailPage view={data.view} loadError={data.loadError} />
