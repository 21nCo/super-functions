<script lang="ts">
  import type { CreateHoverCardProps } from '@uifn/core/primitives/hover-card';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { HoverCardDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<CreateHoverCardProps, 'div'>;
  let { open = $bindable(), onOpenChange, children, render, ref = $bindable(null), ...rest }: Props = $props();
  const handleOpenChange = (next: Parameters<NonNullable<CreateHoverCardProps['onOpenChange']>>[0]) => {
    open = next;
    onOpenChange?.(next);
  };
  const runtimeProps = $derived({ ...rest, open, onOpenChange: handleOpenChange });
</script>

<PrimitiveRoot
  definition={HoverCardDefinition}
  element="div"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
