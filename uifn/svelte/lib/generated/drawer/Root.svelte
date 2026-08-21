<script lang="ts">
  import type { DrawerProps } from '@uifn/core/primitives/drawer';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { DrawerDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<DrawerProps, 'div'>;
  let { open = $bindable(), onOpenChange, children, render, ref = $bindable(null), ...rest }: Props = $props();
  const handleOpenChange = (next: Parameters<NonNullable<DrawerProps['onOpenChange']>>[0]) => {
    open = next;
    onOpenChange?.(next);
  };
  const runtimeProps = $derived({ ...rest, open, onOpenChange: handleOpenChange });
</script>

<PrimitiveRoot
  definition={DrawerDefinition}
  element="div"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
