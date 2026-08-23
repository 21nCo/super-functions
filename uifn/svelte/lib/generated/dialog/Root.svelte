<script lang="ts">
  import type { DialogProps } from '@uifn/core/primitives/dialog';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { DialogDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<DialogProps, 'div'>;
  let { open = $bindable(), onOpenChange, children, render, ref = $bindable(null), ...rest }: Props = $props();
  const handleOpenChange = (next: Parameters<NonNullable<DialogProps['onOpenChange']>>[0]) => {
    open = next;
    onOpenChange?.(next);
  };
  const runtimeProps = $derived({ ...rest, open, onOpenChange: handleOpenChange });
</script>

<PrimitiveRoot
  definition={DialogDefinition}
  element="div"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
