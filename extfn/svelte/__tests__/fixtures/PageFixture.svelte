<script lang="ts">
  let { title = 'Page Fixture' }: { title?: string } = $props();
</script>

<main data-page-fixture>
  <h1>{title}</h1>
</main>
