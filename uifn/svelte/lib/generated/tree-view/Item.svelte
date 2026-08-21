<script lang="ts">
  import type { TreeViewController } from '@uifn/core/primitives/tree-view';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { TreeViewDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<TreeViewController['parts']['item'], 'div', true>;
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
  definition={TreeViewDefinition}
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
