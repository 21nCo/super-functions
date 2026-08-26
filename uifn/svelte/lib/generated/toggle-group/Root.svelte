<script lang="ts">
  import type { ToggleGroupProps } from '@uifn/core/primitives/toggle-group';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { ToggleGroupDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<ToggleGroupProps, 'div'>;
  let { value = $bindable(), onValueChange, children, render, ref = $bindable(null), ...rest }: Props = $props();
  const handleValueChange = (next: Parameters<NonNullable<ToggleGroupProps['onValueChange']>>[0]) => {
    value = next;
    onValueChange?.(next);
  };
  const runtimeProps = $derived({ ...rest, value, onValueChange: handleValueChange });
</script>

<PrimitiveRoot
  definition={ToggleGroupDefinition}
  element="div"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
