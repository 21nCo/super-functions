<script lang="ts">
  import type { RadioGroupController } from '@uifn/core/primitives/radio-group';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { RadioGroupDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<RadioGroupController['parts']['hiddenInput'], 'input', true>;
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
  definition={RadioGroupDefinition}
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
