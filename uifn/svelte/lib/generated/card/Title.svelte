<script lang="ts">
  import type { CardContractParts } from '@uifn/core/primitives/card';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { CardDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<CardContractParts['title'], 'h3', false>;
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
  definition={CardDefinition}
  part="title"
  element="h3"
  many={false}
  props={rest}
  {value}
  {forceMount}
  {container}
  {children}
  {render}
  bind:ref
/>
