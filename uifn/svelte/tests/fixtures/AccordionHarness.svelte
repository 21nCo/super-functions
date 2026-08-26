<script lang="ts">
  import { Accordion } from '../../lib/index.js';

  interface Props {
    disabled?: boolean;
    value?: string | string[];
  }

  let { disabled = false, value = $bindable([]) }: Props = $props();
</script>

<Accordion.Root type="multiple" {disabled} bind:value data-testid="accordion-root">
  <Accordion.Item value="one">
    <Accordion.Header value="one">
      <Accordion.Trigger value="one">First section</Accordion.Trigger>
    </Accordion.Header>
    <Accordion.Content value="one">First content</Accordion.Content>
  </Accordion.Item>
</Accordion.Root>
<output data-testid="accordion-value">{JSON.stringify(value)}</output>
