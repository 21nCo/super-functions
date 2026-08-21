<script lang="ts">
  import type { AccordionController } from '@uifn/core/primitives/accordion';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { AccordionDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<AccordionController['parts']['header'], 'h2', true>;
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
  definition={AccordionDefinition}
  part="header"
  element="h2"
  many={true}
  props={rest}
  {value}
  {forceMount}
  {container}
  {children}
  {render}
  bind:ref
/>
