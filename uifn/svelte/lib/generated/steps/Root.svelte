<script lang="ts">
  import type { StepsProps } from '@uifn/core/primitives/steps';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { StepsDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<StepsProps, 'nav'>;
  let { step = $bindable(), onStepChange, children, render, ref = $bindable(null), ...rest }: Props = $props();
  const handleStepChange = (next: Parameters<NonNullable<StepsProps['onStepChange']>>[0]) => {
    step = next;
    onStepChange?.(next);
  };
  const runtimeProps = $derived({ ...rest, step, onStepChange: handleStepChange });
</script>

<PrimitiveRoot
  definition={StepsDefinition}
  element="nav"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
