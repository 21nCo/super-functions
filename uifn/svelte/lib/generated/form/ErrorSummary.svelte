<script lang="ts">
  import type { FormContractParts } from '@uifn/core/primitives/form';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { FormDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<FormContractParts['errorSummary'], 'div', false>;
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
  definition={FormDefinition}
  part="errorSummary"
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
