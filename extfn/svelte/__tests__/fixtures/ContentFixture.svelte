<script lang="ts">
  let { label = 'Content Fixture' }: { label?: string } = $props();
</script>

<section data-content-fixture>
  <span>{label}</span>
</section>
