<script lang="ts">
  import ResourceListPage from '$lib/components/ResourceListPage.svelte';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
</script>

<ResourceListPage view={data.view} loadError={data.loadError} initialQuery={data.query} />
