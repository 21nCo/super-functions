<script lang="ts">
  import type { PinInputProps } from '@uifn/core/primitives/pin-input';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { PinInputDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<PinInputProps, 'div'>;
  let { value = $bindable(), onValueChange, children, render, ref = $bindable(null), ...rest }: Props = $props();
  const handleValueChange = (next: Parameters<NonNullable<PinInputProps['onValueChange']>>[0]) => {
    value = next;
    onValueChange?.(next);
  };
  const runtimeProps = $derived({ ...rest, value, onValueChange: handleValueChange });
</script>

<PrimitiveRoot
  definition={PinInputDefinition}
  element="div"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
