<script lang="ts">
  import PlugFnLanding from "$lib/components/PlugFnLanding.svelte";
  import type { PageData } from "./$types";
  let { data }: { data: PageData } = $props();
</script>

<PlugFnLanding siteTitle={data.source.siteTitle} description={data.source.config.site.description ?? ""} />
