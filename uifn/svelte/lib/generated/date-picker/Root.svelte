<script lang="ts">
  import type { DatePickerProps } from '@uifn/core/primitives/date-picker';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { DatePickerDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<DatePickerProps, 'div'>;
  let { value = $bindable(), open = $bindable(), onValueChange, onOpenChange, children, render, ref = $bindable(null), ...rest }: Props = $props();
  const handleValueChange = (next: Parameters<NonNullable<DatePickerProps['onValueChange']>>[0]) => {
    value = next;
    onValueChange?.(next);
  };
  const handleOpenChange = (next: Parameters<NonNullable<DatePickerProps['onOpenChange']>>[0]) => {
    open = next;
    onOpenChange?.(next);
  };
  const runtimeProps = $derived({ ...rest, value, open, onValueChange: handleValueChange, onOpenChange: handleOpenChange });
</script>

<PrimitiveRoot
  definition={DatePickerDefinition}
  element="div"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
