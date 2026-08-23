<script lang="ts">
  import type { SelectProps } from '@uifn/core/primitives/select';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { SelectDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<SelectProps, 'div'>;
  let { value = $bindable(), onValueChange, children, render, ref = $bindable(null), ...rest }: Props = $props();
  const handleValueChange = (next: Parameters<NonNullable<SelectProps['onValueChange']>>[0]) => {
    value = next;
    onValueChange?.(next);
  };
  const runtimeProps = $derived({ ...rest, value, onValueChange: handleValueChange });
</script>

<PrimitiveRoot
  definition={SelectDefinition}
  element="div"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
