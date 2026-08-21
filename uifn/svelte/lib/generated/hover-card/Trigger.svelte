<script lang="ts">
  import type { HoverCardController } from '@uifn/core/primitives/hover-card';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { HoverCardDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<HoverCardController['parts']['trigger'], 'a', false>;
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
  definition={HoverCardDefinition}
  part="trigger"
  element="a"
  many={false}
  props={rest}
  {value}
  {forceMount}
  {container}
  {children}
  {render}
  bind:ref
/>
