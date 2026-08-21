<script lang="ts">
  import type { ToggleProps } from '@uifn/core/primitives/toggle';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { ToggleDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<ToggleProps, 'button'>;
  let { pressed = $bindable(), onPressedChange, children, render, ref = $bindable(null), ...rest }: Props = $props();
  const handlePressedChange = (next: Parameters<NonNullable<ToggleProps['onPressedChange']>>[0]) => {
    pressed = next;
    onPressedChange?.(next);
  };
  const runtimeProps = $derived({ ...rest, pressed, onPressedChange: handlePressedChange });
</script>

<PrimitiveRoot
  definition={ToggleDefinition}
  element="button"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
