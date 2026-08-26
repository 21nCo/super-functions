<script lang="ts">
  import type { TimerProps } from '@uifn/core/primitives/timer';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { TimerDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<TimerProps, 'div'>;
  let { remaining = $bindable(), onRemainingChange, children, render, ref = $bindable(null), ...rest }: Props = $props();
  const handleRemainingChange = (next: Parameters<NonNullable<TimerProps['onRemainingChange']>>[0]) => {
    remaining = next;
    onRemainingChange?.(next);
  };
  const runtimeProps = $derived({ ...rest, remaining, onRemainingChange: handleRemainingChange });
</script>

<PrimitiveRoot
  definition={TimerDefinition}
  element="div"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
