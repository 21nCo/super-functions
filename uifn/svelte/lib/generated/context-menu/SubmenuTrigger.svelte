<script lang="ts">
  import type { ContextMenuController } from '@uifn/core/primitives/context-menu';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { ContextMenuDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<ContextMenuController['parts']['submenuTrigger'], 'div', true>;
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
  definition={ContextMenuDefinition}
  part="submenuTrigger"
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
