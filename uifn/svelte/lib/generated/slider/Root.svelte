<script lang="ts">
  import type { SliderProps } from '@uifn/core/primitives/slider';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { SliderDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<SliderProps, 'div'>;
  let { value = $bindable(), onValueChange, children, render, ref = $bindable(null), ...rest }: Props = $props();
  const handleValueChange = (next: Parameters<NonNullable<SliderProps['onValueChange']>>[0]) => {
    value = next;
    onValueChange?.(next);
  };
  const runtimeProps = $derived({ ...rest, value, onValueChange: handleValueChange });
</script>

<PrimitiveRoot
  definition={SliderDefinition}
  element="div"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
