<script lang="ts">
  import type { PinInputController } from '@uifn/core/primitives/pin-input';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { PinInputDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<PinInputController['parts']['label'], 'label', false>;
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
  definition={PinInputDefinition}
  part="label"
  element="label"
  many={false}
  props={rest}
  {value}
  {forceMount}
  {container}
  {children}
  {render}
  bind:ref
/>
