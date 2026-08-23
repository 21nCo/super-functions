<script lang="ts">
  import { Accordion } from '../../lib/index.js';

  let { value = [] }: { value?: string[] } = $props();
</script>

{#snippet diagnostic(payload: import('../../lib/index.js').SveltePrimitiveRenderPayload)}
  {@const rootAction = payload.action}
  <div
    use:rootAction={payload.actionParams}
    data-testid="lifecycle"
    data-generation={payload.bridge.getGeneration()}
    data-dom-generation={payload.bridge.getLifecycleCounters().domGeneration}
    data-dom-destroy-count={payload.bridge.getLifecycleCounters().domDestroyCount}
    data-value={JSON.stringify(payload.state.value)}
    data-status={payload.status}
  ></div>
{/snippet}

<Accordion.Root type="multiple" {value} render={diagnostic} />
