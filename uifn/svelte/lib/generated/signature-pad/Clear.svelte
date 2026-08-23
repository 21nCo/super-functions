<script lang="ts">
  import type { SignaturePadController } from '@uifn/core/primitives/signature-pad';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { SignaturePadDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<SignaturePadController['parts']['clear'], 'button', false>;
  let {
    value,
    forceMount = false,
    container,
    children,
    render,
    ref = $bindable(null),
    ...rest
  }: Props = $props();
</script>

<PrimitivePart
  definition={SignaturePadDefinition}
  part="clear"
  element="button"
  many={false}
  props={rest}
  {value}
  {forceMount}
  {container}
  {children}
  {render}
  bind:ref
/>
