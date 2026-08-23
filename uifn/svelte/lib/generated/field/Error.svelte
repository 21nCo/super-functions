<script lang="ts">
  import type { FieldContractParts } from '@uifn/core/primitives/field';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { FieldDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<FieldContractParts['error'], 'div', false>;
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
  part="error"
  element="div"
  many={false}
  props={rest}
  {value}
  {forceMount}
  {container}
  {children}
  {render}
  bind:ref
/>
