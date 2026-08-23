<script lang="ts">
  import type { AlertDialogController } from '@uifn/core/primitives/alert-dialog';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { AlertDialogDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<AlertDialogController['parts']['cancel'], 'button', false>;
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
  part="cancel"
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
