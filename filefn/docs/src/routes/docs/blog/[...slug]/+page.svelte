<script lang="ts">
  import BlogPost from "../../../blog/[slug]/+page.svelte";
  import type { PageData } from "./$types";
  let { data }: { data: PageData } = $props();
</script>

<BlogPost {data} />
