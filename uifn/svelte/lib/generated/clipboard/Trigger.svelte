<script lang="ts">
  import type { ClipboardController } from '@uifn/core/primitives/clipboard';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { ClipboardDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<ClipboardController['parts']['trigger'], 'button', false>;
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
  definition={ClipboardDefinition}
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
