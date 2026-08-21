<script lang="ts">
  import type { ComboboxController } from '@uifn/core/primitives/combobox';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { ComboboxDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<ComboboxController['parts']['empty'], 'div', false>;
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
  definition={ComboboxDefinition}
  part="empty"
  element="div"
  many={false}
  props={rest}
  {value}
  {forceMount}
  {container}
  {children}
  {render}
  bind:ref
/>
