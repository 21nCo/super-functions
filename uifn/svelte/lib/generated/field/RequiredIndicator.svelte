<script lang="ts">
  import type { FieldContractParts } from '@uifn/core/primitives/field';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { FieldDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<FieldContractParts['requiredIndicator'], 'span', false>;
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
  definition={FieldDefinition}
  part="requiredIndicator"
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
