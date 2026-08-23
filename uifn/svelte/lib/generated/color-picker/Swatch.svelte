<script lang="ts">
  import type { ColorPickerController } from '@uifn/core/primitives/color-picker';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { ColorPickerDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<ColorPickerController['parts']['swatch'], 'span', false>;
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
  definition={ColorPickerDefinition}
  part="swatch"
  element="span"
  many={false}
  props={rest}
  {value}
  {forceMount}
  {container}
  {children}
  {render}
  bind:ref
/>
