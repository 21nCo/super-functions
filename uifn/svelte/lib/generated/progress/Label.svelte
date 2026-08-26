<script lang="ts">
  import type { ProgressContractParts } from '@uifn/core/primitives/progress';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { ProgressDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<ProgressContractParts['label'], 'span', false>;
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
  definition={ProgressDefinition}
  part="label"
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
