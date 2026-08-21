<script lang="ts">
  import type { SignaturePadProps } from '@uifn/core/primitives/signature-pad';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { SignaturePadDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<SignaturePadProps, 'div'>;
  let { value = $bindable(), onValueChange, children, render, ref = $bindable(null), ...rest }: Props = $props();
  const handleValueChange = (next: Parameters<NonNullable<SignaturePadProps['onValueChange']>>[0]) => {
    value = next;
    onValueChange?.(next);
  };
  const runtimeProps = $derived({ ...rest, value, onValueChange: handleValueChange });
</script>

<PrimitiveRoot
  definition={SignaturePadDefinition}
  element="div"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
