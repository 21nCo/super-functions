<script lang="ts">
  import type { NumberInputProps } from '@uifn/core/primitives/number-input';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { NumberInputDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<NumberInputProps, 'div'>;
  let { value = $bindable(), onValueChange, children, render, ref = $bindable(null), ...rest }: Props = $props();
  const handleValueChange = (next: Parameters<NonNullable<NumberInputProps['onValueChange']>>[0]) => {
    value = next;
    onValueChange?.(next);
  };
  const runtimeProps = $derived({ ...rest, value, onValueChange: handleValueChange });
</script>

<PrimitiveRoot
  definition={NumberInputDefinition}
  element="div"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
