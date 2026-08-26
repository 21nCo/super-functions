<script lang="ts">
  import type { TourProps } from '@uifn/core/primitives/tour';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { TourDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<TourProps, 'div'>;
  let { open = $bindable(), step = $bindable(), onOpenChange, onStepChange, children, render, ref = $bindable(null), ...rest }: Props = $props();
  const handleOpenChange = (next: Parameters<NonNullable<TourProps['onOpenChange']>>[0]) => {
    open = next;
    onOpenChange?.(next);
  };
  const handleStepChange = (next: Parameters<NonNullable<TourProps['onStepChange']>>[0]) => {
    step = next;
    onStepChange?.(next);
  };
  const runtimeProps = $derived({ ...rest, open, step, onOpenChange: handleOpenChange, onStepChange: handleStepChange });
</script>

<PrimitiveRoot
  definition={TourDefinition}
  element="div"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
