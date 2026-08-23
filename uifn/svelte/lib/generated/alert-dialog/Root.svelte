<script lang="ts">
  import type { AlertDialogProps } from '@uifn/core/primitives/alert-dialog';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { AlertDialogDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<AlertDialogProps, 'div'>;
  let { open = $bindable(), onOpenChange, children, render, ref = $bindable(null), ...rest }: Props = $props();
  const handleOpenChange = (next: Parameters<NonNullable<AlertDialogProps['onOpenChange']>>[0]) => {
    open = next;
    onOpenChange?.(next);
  };
  const runtimeProps = $derived({ ...rest, open, onOpenChange: handleOpenChange });
</script>

<PrimitiveRoot
  definition={AlertDialogDefinition}
  element="div"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
