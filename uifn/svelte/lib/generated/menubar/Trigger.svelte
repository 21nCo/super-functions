<script lang="ts">
  import type { MenubarController } from '@uifn/core/primitives/menubar';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { MenubarDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<MenubarController['parts']['trigger'], 'button', true>;
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
  definition={MenubarDefinition}
  part="trigger"
  element="button"
  many={true}
  props={rest}
  {value}
  {forceMount}
  {container}
  {children}
  {render}
  bind:ref
/>
