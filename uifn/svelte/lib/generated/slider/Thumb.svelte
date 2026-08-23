<script lang="ts">
  import type { SliderController } from '@uifn/core/primitives/slider';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { SliderDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<SliderController['parts']['thumb'], 'div', true>;
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
  definition={SliderDefinition}
  part="thumb"
  element="div"
  many={true}
  props={rest}
  {value}
  {forceMount}
  {container}
  {children}
  {render}
  bind:ref
/>
