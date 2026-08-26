<script lang="ts">
  import type { AngleSliderController } from '@uifn/core/primitives/angle-slider';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { AngleSliderDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<AngleSliderController['parts']['valueText'], 'span', false>;
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
  definition={AngleSliderDefinition}
  part="valueText"
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
