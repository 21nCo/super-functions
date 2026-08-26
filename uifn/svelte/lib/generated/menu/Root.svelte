<script lang="ts">
  import type { MenuProps } from '@uifn/core/primitives/menu';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { MenuDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<MenuProps, 'div'>;
  let { open = $bindable(), onOpenChange, children, render, ref = $bindable(null), ...rest }: Props = $props();
  const handleOpenChange = (next: Parameters<NonNullable<MenuProps['onOpenChange']>>[0]) => {
    open = next;
    onOpenChange?.(next);
  };
  const runtimeProps = $derived({ ...rest, open, onOpenChange: handleOpenChange });
</script>

<PrimitiveRoot
  definition={MenuDefinition}
  element="div"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
