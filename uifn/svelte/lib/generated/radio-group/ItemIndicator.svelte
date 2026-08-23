<script lang="ts">
  import type { RadioGroupController } from '@uifn/core/primitives/radio-group';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { RadioGroupDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<RadioGroupController['parts']['itemIndicator'], 'span', true>;
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
  part="itemIndicator"
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
