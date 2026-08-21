<script lang="ts">
  import type { ToolbarController } from '@uifn/core/primitives/toolbar';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { ToolbarDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<ToolbarController['parts']['link'], 'a', true>;
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
  definition={ToolbarDefinition}
  part="link"
  element="a"
  many={true}
  props={rest}
  {value}
  {forceMount}
  {container}
  {children}
  {render}
  bind:ref
/>
