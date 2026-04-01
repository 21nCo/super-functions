<script lang="ts">
  let { label }: { label: string } = $props();
</script>

<aside class="badge badge-youtube" data-youtube-badge>
  <strong>{label}</strong>
  <span>Svelte content mount via light DOM.</span>
</aside>

<style>
  .badge {
    display: grid;
    gap: 0.35rem;
    border-radius: 0.9rem;
    padding: 0.85rem 1rem;
    background: linear-gradient(135deg, #7f1d1d, #991b1b);
    color: #fff7ed;
    font: 600 14px/1.4 system-ui, sans-serif;
  }

  .badge-youtube {
    border: 1px solid rgba(254, 202, 202, 0.45);
  }

  strong {
    font-size: 0.95rem;
  }

  span {
    font-size: 0.8rem;
    opacity: 0.85;
  }
</style>
