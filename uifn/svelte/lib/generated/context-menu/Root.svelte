<script lang="ts">
  import type { ContextMenuProps } from '@uifn/core/primitives/context-menu';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { ContextMenuDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<ContextMenuProps, 'div'>;
  let { open = $bindable(), onOpenChange, children, render, ref = $bindable(null), ...rest }: Props = $props();
  const handleOpenChange = (next: Parameters<NonNullable<ContextMenuProps['onOpenChange']>>[0]) => {
    open = next;
    onOpenChange?.(next);
  };
  const runtimeProps = $derived({ ...rest, open, onOpenChange: handleOpenChange });
</script>

<PrimitiveRoot
  definition={ContextMenuDefinition}
  element="div"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
