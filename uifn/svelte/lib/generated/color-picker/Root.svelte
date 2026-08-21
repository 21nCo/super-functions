<script lang="ts">
  import type { ColorPickerProps } from '@uifn/core/primitives/color-picker';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { ColorPickerDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<ColorPickerProps, 'div'>;
  let { value = $bindable(), open = $bindable(), onValueChange, onOpenChange, children, render, ref = $bindable(null), ...rest }: Props = $props();
  const handleValueChange = (next: Parameters<NonNullable<ColorPickerProps['onValueChange']>>[0]) => {
    value = next;
    onValueChange?.(next);
  };
  const handleOpenChange = (next: Parameters<NonNullable<ColorPickerProps['onOpenChange']>>[0]) => {
    open = next;
    onOpenChange?.(next);
  };
  const runtimeProps = $derived({ ...rest, value, open, onValueChange: handleValueChange, onOpenChange: handleOpenChange });
</script>

<PrimitiveRoot
  definition={ColorPickerDefinition}
  element="div"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
