<script lang="ts">
  import type { TableContractParts } from '@uifn/core/primitives/table';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { TableDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<TableContractParts['caption'], 'caption', false>;
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
  definition={TableDefinition}
  part="caption"
  element="caption"
  many={false}
  props={rest}
  {value}
  {forceMount}
  {container}
  {children}
  {render}
  bind:ref
/>
