<script lang="ts">
  import type { DateInputController } from '@uifn/core/primitives/date-input';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { DateInputDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<DateInputController['parts']['segment'], 'span', true>;
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
  definition={DateInputDefinition}
  part="segment"
  element="span"
  many={true}
  props={rest}
  {value}
  {forceMount}
  {container}
  {children}
  {render}
  bind:ref
/>
