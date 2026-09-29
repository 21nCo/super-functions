<script lang="ts">
  import McpFnLanding from "$lib/components/McpFnLanding.svelte";
  import type { PageData } from "./$types";
  let { data }: { data: PageData } = $props();
</script>

<McpFnLanding siteTitle={data.source.siteTitle} description={data.source.config.site.description ?? ""} />
