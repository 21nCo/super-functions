<script lang="ts">
  import type { TabsProps } from '@uifn/core/primitives/tabs';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { TabsDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<TabsProps, 'div'>;
  let { value = $bindable(), onValueChange, children, render, ref = $bindable(null), ...rest }: Props = $props();
  const handleValueChange = (next: Parameters<NonNullable<TabsProps['onValueChange']>>[0]) => {
    value = next;
    onValueChange?.(next);
  };
  const runtimeProps = $derived({ ...rest, value, onValueChange: handleValueChange });
</script>

<PrimitiveRoot
  definition={TabsDefinition}
  element="div"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
