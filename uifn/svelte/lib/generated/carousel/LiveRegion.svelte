<script lang="ts">
  import type { CarouselController } from '@uifn/core/primitives/carousel';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { CarouselDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<CarouselController['parts']['liveRegion'], 'div', false>;
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
  definition={CarouselDefinition}
  part="liveRegion"
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
