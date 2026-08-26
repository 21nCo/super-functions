<script lang="ts">
  import type { MarqueeContractParts } from '@uifn/core/primitives/marquee';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { MarqueeDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<MarqueeContractParts['item'], 'div', true>;
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
  definition={MarqueeDefinition}
  part="item"
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
