<script lang="ts">
  import type { AutocompleteController } from '@uifn/core/primitives/autocomplete';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { AutocompleteDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<AutocompleteController['parts']['clear'], 'button', false>;
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
  definition={AutocompleteDefinition}
  part="clear"
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
