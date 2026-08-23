<script lang="ts">
  import type { CommandProps } from '@uifn/core/primitives/command';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { CommandDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<CommandProps, 'div'>;
  let { value = $bindable(), inputValue = $bindable(), onValueChange, onInputValueChange, children, render, ref = $bindable(null), ...rest }: Props = $props();
  const handleValueChange = (next: Parameters<NonNullable<CommandProps['onValueChange']>>[0]) => {
    value = next;
    onValueChange?.(next);
  };
  const handleInputValueChange = (next: Parameters<NonNullable<CommandProps['onInputValueChange']>>[0]) => {
    inputValue = next;
    onInputValueChange?.(next);
  };
  const runtimeProps = $derived({ ...rest, value, inputValue, onValueChange: handleValueChange, onInputValueChange: handleInputValueChange });
</script>

<PrimitiveRoot
  definition={CommandDefinition}
  element="div"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
