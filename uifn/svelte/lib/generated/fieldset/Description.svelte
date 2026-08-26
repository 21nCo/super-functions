<script lang="ts">
  import type { FieldsetContractParts } from '@uifn/core/primitives/fieldset';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { FieldsetDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<FieldsetContractParts['description'], 'div', false>;
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
  definition={FieldsetDefinition}
  part="description"
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
