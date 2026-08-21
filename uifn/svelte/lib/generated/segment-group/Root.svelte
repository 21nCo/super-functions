<script lang="ts">
  import type { SegmentGroupProps } from '@uifn/core/primitives/segment-group';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { SegmentGroupDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<SegmentGroupProps, 'div'>;
  let { value = $bindable(), onValueChange, children, render, ref = $bindable(null), ...rest }: Props = $props();
  const handleValueChange = (next: Parameters<NonNullable<SegmentGroupProps['onValueChange']>>[0]) => {
    value = next;
    onValueChange?.(next);
  };
  const runtimeProps = $derived({ ...rest, value, onValueChange: handleValueChange });
</script>

<PrimitiveRoot
  definition={SegmentGroupDefinition}
  element="div"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
