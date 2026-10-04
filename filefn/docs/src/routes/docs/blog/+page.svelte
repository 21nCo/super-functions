<script lang="ts">
  import BlogIndex from "../../blog/+page.svelte";
  import type { PageData } from "./$types";
  let { data }: { data: PageData } = $props();
</script>

<BlogIndex {data} />
