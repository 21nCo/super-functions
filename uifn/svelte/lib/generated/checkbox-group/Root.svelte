<script lang="ts">
  import type { CheckboxGroupProps } from '@uifn/core/primitives/checkbox-group';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { CheckboxGroupDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<CheckboxGroupProps, 'fieldset'>;
  let { value = $bindable(), onValueChange, children, render, ref = $bindable(null), ...rest }: Props = $props();
  const handleValueChange = (next: Parameters<NonNullable<CheckboxGroupProps['onValueChange']>>[0]) => {
    value = next;
    onValueChange?.(next);
  };
  const runtimeProps = $derived({ ...rest, value, onValueChange: handleValueChange });
</script>

<PrimitiveRoot
  definition={CheckboxGroupDefinition}
  element="fieldset"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
