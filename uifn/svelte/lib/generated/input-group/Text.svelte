<script lang="ts">
  import type { InputGroupContractParts } from '@uifn/core/primitives/input-group';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { InputGroupDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<InputGroupContractParts['text'], 'span', true>;
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
  definition={InputGroupDefinition}
  part="text"
  element="span"
  many={true}
  props={rest}
  {value}
  {forceMount}
  {container}
  {children}
  {render}
  bind:ref
/>
