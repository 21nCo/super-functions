<script lang="ts">
  import type { QRCodeContractParts } from '@uifn/core/primitives/qr-code';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { QRCodeDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<QRCodeContractParts['caption'], 'figcaption', false>;
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
  definition={QRCodeDefinition}
  part="caption"
  element="figcaption"
  many={false}
  props={rest}
  {value}
  {forceMount}
  {container}
  {children}
  {render}
  bind:ref
/>
