<script lang="ts">
  import type { RadioGroupController } from '@uifn/core/primitives/radio-group';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { RadioGroupDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<RadioGroupController['parts']['item'], 'label', true>;
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
  definition={RadioGroupDefinition}
  part="item"
  element="label"
  many={true}
  props={rest}
  {value}
  {forceMount}
  {container}
  {children}
  {render}
  bind:ref
/>
