<script lang="ts">
  import type { DialogController } from '@uifn/core/primitives/dialog';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { DialogDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<DialogController['parts']['title'], 'h2', false>;
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
