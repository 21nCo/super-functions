<script lang="ts">
  import type { TooltipProps } from '@uifn/core/primitives/tooltip';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { TooltipDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<TooltipProps, 'span'>;
  let { open = $bindable(), onOpenChange, children, render, ref = $bindable(null), ...rest }: Props = $props();
  const handleOpenChange = (next: Parameters<NonNullable<TooltipProps['onOpenChange']>>[0]) => {
    open = next;
    onOpenChange?.(next);
  };
  const runtimeProps = $derived({ ...rest, open, onOpenChange: handleOpenChange });
</script>

<PrimitiveRoot
  definition={TooltipDefinition}
  element="span"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
