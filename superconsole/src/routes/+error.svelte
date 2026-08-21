<script lang="ts">
  import { page } from '$app/state';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import StatePanel from '$lib/components/StatePanel.svelte';
</script>

<PageHeader eyebrow="Super Console" title="Operator request failed" description="The shell is still available while you recover or inspect the request." />
<StatePanel
  kind={page.status === 403 ? 'forbidden' : page.status === 404 ? 'not-found' : 'error'}
  title={page.error?.message}
  error={{
    status: page.status,
    code: page.error?.code ?? 'SVELTEKIT_ERROR',
    message: page.error?.message ?? 'An unexpected error occurred.',
    details: page.error?.details,
  }}
  actionHref="/"
  actionLabel="Return to overview"
/>
