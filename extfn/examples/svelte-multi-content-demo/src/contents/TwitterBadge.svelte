<script lang="ts">
  let { label }: { label: string } = $props();
</script>

<aside class="badge badge-twitter" data-twitter-badge>
  <strong>{label}</strong>
  <span>Svelte content mount via shadow root.</span>
</aside>

<style>
  .badge {
    display: grid;
    gap: 0.35rem;
    border-radius: 0.9rem;
    padding: 0.85rem 1rem;
    background: linear-gradient(135deg, #0f172a, #1e293b);
    color: #f8fafc;
    font: 600 14px/1.4 system-ui, sans-serif;
  }

  .badge-twitter {
    border: 1px solid rgba(125, 211, 252, 0.35);
  }

  strong {
    font-size: 0.95rem;
  }

  span {
    font-size: 0.8rem;
    opacity: 0.85;
  }
</style>
