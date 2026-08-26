<script lang="ts">
  import type { CollapsibleProps } from '@uifn/core/primitives/collapsible';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { CollapsibleDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<CollapsibleProps, 'div'>;
  let { open = $bindable(), onOpenChange, children, render, ref = $bindable(null), ...rest }: Props = $props();
  const handleOpenChange = (next: Parameters<NonNullable<CollapsibleProps['onOpenChange']>>[0]) => {
    open = next;
    onOpenChange?.(next);
  };
  const runtimeProps = $derived({ ...rest, open, onOpenChange: handleOpenChange });
</script>

<PrimitiveRoot
  definition={CollapsibleDefinition}
  element="div"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
