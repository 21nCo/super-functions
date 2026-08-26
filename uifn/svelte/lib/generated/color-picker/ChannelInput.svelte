<script lang="ts">
  import type { ColorPickerController } from '@uifn/core/primitives/color-picker';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { ColorPickerDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<ColorPickerController['parts']['channelInput'], 'input', true>;
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
  part="channelInput"
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
