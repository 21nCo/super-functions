<script lang="ts">
  import SendFnLanding from "$lib/components/SendFnLanding.svelte";
  import type { PageData } from "./$types";
  let { data }: { data: PageData } = $props();
</script>

<SendFnLanding {data} />
