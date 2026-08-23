<script lang="ts">
  import type { MarqueeContractParts } from '@uifn/core/primitives/marquee';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { MarqueeDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<MarqueeContractParts['viewport'], 'div', false>;
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
  part="viewport"
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
