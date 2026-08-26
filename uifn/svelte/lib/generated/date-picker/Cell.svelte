<script lang="ts">
  import type { DatePickerController } from '@uifn/core/primitives/date-picker';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { DatePickerDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<DatePickerController['parts']['cell'], 'td', true>;
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
  definition={DatePickerDefinition}
  part="cell"
  element="td"
  many={true}
  props={rest}
  {value}
  {forceMount}
  {container}
  {children}
  {render}
  bind:ref
/>
