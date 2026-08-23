<script lang="ts">
  import type { RadioGroupProps } from '@uifn/core/primitives/radio-group';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { RadioGroupDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<RadioGroupProps, 'fieldset'>;
  let { value = $bindable(), onValueChange, children, render, ref = $bindable(null), ...rest }: Props = $props();
  const handleValueChange = (next: Parameters<NonNullable<RadioGroupProps['onValueChange']>>[0]) => {
    value = next;
    onValueChange?.(next);
  };
  const runtimeProps = $derived({ ...rest, value, onValueChange: handleValueChange });
</script>

<PrimitiveRoot
  definition={RadioGroupDefinition}
  element="fieldset"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
