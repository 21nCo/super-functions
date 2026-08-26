<script lang="ts">
  import type { SelectController } from '@uifn/core/primitives/select';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { SelectDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<SelectController['parts']['hiddenInput'], 'input', true>;
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
  definition={SelectDefinition}
  part="hiddenInput"
  element="input"
  many={true}
  props={rest}
  {value}
  {forceMount}
  {container}
  {children}
  {render}
  bind:ref
/>
