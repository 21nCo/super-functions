<script lang="ts">
  import type { ComboboxProps } from '@uifn/core/primitives/combobox';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { ComboboxDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<ComboboxProps, 'div'>;
  let { value = $bindable(), onValueChange, children, render, ref = $bindable(null), ...rest }: Props = $props();
  const handleValueChange = (next: Parameters<NonNullable<ComboboxProps['onValueChange']>>[0]) => {
    value = next;
    onValueChange?.(next);
  };
  const runtimeProps = $derived({ ...rest, value, onValueChange: handleValueChange });
</script>

<PrimitiveRoot
  definition={ComboboxDefinition}
  element="div"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
