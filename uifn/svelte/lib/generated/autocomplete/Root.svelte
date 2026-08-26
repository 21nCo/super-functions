<script lang="ts">
  import type { AutocompleteProps } from '@uifn/core/primitives/autocomplete';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { AutocompleteDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<AutocompleteProps, 'div'>;
  let { value = $bindable(), onValueChange, children, render, ref = $bindable(null), ...rest }: Props = $props();
  const handleValueChange = (next: Parameters<NonNullable<AutocompleteProps['onValueChange']>>[0]) => {
    value = next;
    onValueChange?.(next);
  };
  const runtimeProps = $derived({ ...rest, value, onValueChange: handleValueChange });
</script>

<PrimitiveRoot
  definition={AutocompleteDefinition}
  element="div"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
