<script lang="ts">
  import type { SkeletonProps } from '@uifn/core/primitives/skeleton';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { SkeletonDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<SkeletonProps, 'div'>;
  let { children, render, ref = $bindable(null), ...rest }: Props = $props();

  const runtimeProps = $derived({ ...rest });
</script>

<PrimitiveRoot
  definition={SkeletonDefinition}
  element="div"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
