<script lang="ts">
  import type { FloatingPanelProps } from '@uifn/core/primitives/floating-panel';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { FloatingPanelDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<FloatingPanelProps, 'div'>;
  let { open = $bindable(), onOpenChange, children, render, ref = $bindable(null), ...rest }: Props = $props();
  const handleOpenChange = (next: Parameters<NonNullable<FloatingPanelProps['onOpenChange']>>[0]) => {
    open = next;
    onOpenChange?.(next);
  };
  const runtimeProps = $derived({ ...rest, open, onOpenChange: handleOpenChange });
</script>

<PrimitiveRoot
  definition={FloatingPanelDefinition}
  element="div"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
