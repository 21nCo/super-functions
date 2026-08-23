<script lang="ts">
  import type { PopoverProps } from '@uifn/core/primitives/popover';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { PopoverDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<PopoverProps, 'div'>;
  let { open = $bindable(), onOpenChange, children, render, ref = $bindable(null), ...rest }: Props = $props();
  const handleOpenChange = (next: Parameters<NonNullable<PopoverProps['onOpenChange']>>[0]) => {
    open = next;
    onOpenChange?.(next);
  };
  const runtimeProps = $derived({ ...rest, open, onOpenChange: handleOpenChange });
</script>

<PrimitiveRoot
  definition={PopoverDefinition}
  element="div"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
