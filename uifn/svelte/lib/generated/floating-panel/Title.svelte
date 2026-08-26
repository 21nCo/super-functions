<script lang="ts">
  import type { FloatingPanelController } from '@uifn/core/primitives/floating-panel';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { FloatingPanelDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<FloatingPanelController['parts']['title'], 'h2', false>;
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
  definition={FloatingPanelDefinition}
  part="title"
  element="h2"
  many={false}
  props={rest}
  {value}
  {forceMount}
  {container}
  {children}
  {render}
  bind:ref
/>
