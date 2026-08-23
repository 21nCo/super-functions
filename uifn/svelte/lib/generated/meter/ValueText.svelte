<script lang="ts">
  import type { MeterContractParts } from '@uifn/core/primitives/meter';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { MeterDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<MeterContractParts['valueText'], 'span', false>;
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
  definition={MeterDefinition}
  part="valueText"
  element="span"
  many={false}
  props={rest}
  {value}
  {forceMount}
  {container}
  {children}
  {render}
  bind:ref
/>
