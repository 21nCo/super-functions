<script lang="ts">
  import type { AccordionProps } from '@uifn/core/primitives/accordion';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { AccordionDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<AccordionProps, 'div'>;
  let { value = $bindable(), onValueChange, children, render, ref = $bindable(null), ...rest }: Props = $props();
  const handleValueChange = (next: Parameters<NonNullable<AccordionProps['onValueChange']>>[0]) => {
    value = next;
    onValueChange?.(next);
  };
  const runtimeProps = $derived({ ...rest, value, onValueChange: handleValueChange });
</script>

<PrimitiveRoot
  definition={AccordionDefinition}
  element="div"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
