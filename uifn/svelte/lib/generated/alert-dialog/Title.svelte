<script lang="ts">
  import type { AlertDialogController } from '@uifn/core/primitives/alert-dialog';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { AlertDialogDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<AlertDialogController['parts']['title'], 'h2', false>;
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
  definition={AlertDialogDefinition}
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
