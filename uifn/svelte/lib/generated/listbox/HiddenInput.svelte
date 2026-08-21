<script lang="ts">
  import type { ListboxController } from '@uifn/core/primitives/listbox';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { ListboxDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<ListboxController['parts']['hiddenInput'], 'input', true>;
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
  definition={ListboxDefinition}
  part="hiddenInput"
  element="input"
  many={true}
  props={rest}
  {value}
  {forceMount}
  {container}
  {children}
  {render}
  bind:ref
/>
