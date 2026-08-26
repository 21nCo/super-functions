<script lang="ts">
  import type { MeterProps } from '@uifn/core/primitives/meter';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { MeterDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<MeterProps, 'div'>;
  let { value = $bindable(), children, render, ref = $bindable(null), ...rest }: Props = $props();

  const runtimeProps = $derived({ ...rest, value });
</script>

<PrimitiveRoot
  definition={MeterDefinition}
  element="div"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
