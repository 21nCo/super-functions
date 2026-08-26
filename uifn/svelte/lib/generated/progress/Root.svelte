<script lang="ts">
  import type { ProgressProps } from '@uifn/core/primitives/progress';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { ProgressDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<ProgressProps, 'div'>;
  let { value = $bindable(), children, render, ref = $bindable(null), ...rest }: Props = $props();

  const runtimeProps = $derived({ ...rest, value });
</script>

<PrimitiveRoot
  definition={ProgressDefinition}
  element="div"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
