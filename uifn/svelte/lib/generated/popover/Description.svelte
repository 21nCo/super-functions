<script lang="ts">
  import type { PopoverController } from '@uifn/core/primitives/popover';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { PopoverDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<PopoverController['parts']['description'], 'p', false>;
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
  definition={PopoverDefinition}
  part="description"
  element="p"
  many={false}
  props={rest}
  {value}
  {forceMount}
  {container}
  {children}
  {render}
  bind:ref
/>
