<script lang="ts">
  import type { DialogController } from '@uifn/core/primitives/dialog';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { DialogDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<DialogController['parts']['trigger'], 'button', false>;
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
  definition={DialogDefinition}
  part="trigger"
  element="button"
  many={false}
  props={rest}
  {value}
  {forceMount}
  {container}
  {children}
  {render}
  bind:ref
/>
