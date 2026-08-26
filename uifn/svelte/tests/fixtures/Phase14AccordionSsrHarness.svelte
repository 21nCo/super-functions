<script lang="ts">
  import { Accordion } from '../../lib/index.js';

  interface Props {
    rootProps: Record<string, unknown>;
  }

  let { rootProps }: Props = $props();
</script>

<Accordion.Root {...rootProps}>
  <Accordion.Item value="item" data-uifn-phase-14-part="item" data-uifn-phase-14-instance="item">
    <Accordion.Header value="item" data-uifn-phase-14-part="header" data-uifn-phase-14-instance="item">
      <Accordion.Trigger value="item" data-uifn-phase-14-part="trigger" data-uifn-phase-14-instance="item">Accordion Trigger</Accordion.Trigger>
    </Accordion.Header>
    <Accordion.Content value="item" data-uifn-phase-14-part="content" data-uifn-phase-14-instance="item">Accordion Content</Accordion.Content>
    <Accordion.Indicator value="item" data-uifn-phase-14-part="indicator" data-uifn-phase-14-instance="item">Accordion Indicator</Accordion.Indicator>
  </Accordion.Item>
</Accordion.Root>
