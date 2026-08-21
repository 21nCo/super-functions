<script lang="ts">
  import type { DateInputProps } from '@uifn/core/primitives/date-input';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { DateInputDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<DateInputProps, 'div'>;
  let { value = $bindable(), onValueChange, children, render, ref = $bindable(null), ...rest }: Props = $props();
  const handleValueChange = (next: Parameters<NonNullable<DateInputProps['onValueChange']>>[0]) => {
    value = next;
    onValueChange?.(next);
  };
  const runtimeProps = $derived({ ...rest, value, onValueChange: handleValueChange });
</script>

<PrimitiveRoot
  definition={DateInputDefinition}
  element="div"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
