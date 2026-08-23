<script lang="ts">
  import type { ListboxProps } from '@uifn/core/primitives/listbox';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { ListboxDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<ListboxProps, 'div'>;
  let { value = $bindable(), onValueChange, children, render, ref = $bindable(null), ...rest }: Props = $props();
  const handleValueChange = (next: Parameters<NonNullable<ListboxProps['onValueChange']>>[0]) => {
    value = next;
    onValueChange?.(next);
  };
  const runtimeProps = $derived({ ...rest, value, onValueChange: handleValueChange });
</script>

<PrimitiveRoot
  definition={ListboxDefinition}
  element="div"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
