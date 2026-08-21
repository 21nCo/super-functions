<script lang="ts">
  import type { TooltipController } from '@uifn/core/primitives/tooltip';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { TooltipDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<TooltipController['parts']['positioner'], 'div', false>;
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
  definition={TooltipDefinition}
  part="positioner"
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
