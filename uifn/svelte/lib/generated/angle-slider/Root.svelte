<script lang="ts">
  import type { AngleSliderProps } from '@uifn/core/primitives/angle-slider';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { AngleSliderDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<AngleSliderProps, 'div'>;
  let { value = $bindable(), onValueChange, children, render, ref = $bindable(null), ...rest }: Props = $props();
  const handleValueChange = (next: Parameters<NonNullable<AngleSliderProps['onValueChange']>>[0]) => {
    value = next;
    onValueChange?.(next);
  };
  const runtimeProps = $derived({ ...rest, value, onValueChange: handleValueChange });
</script>

<PrimitiveRoot
  definition={AngleSliderDefinition}
  element="div"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
