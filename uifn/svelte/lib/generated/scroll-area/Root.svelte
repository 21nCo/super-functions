<script lang="ts">
  import type { ScrollAreaProps } from '@uifn/core/primitives/scroll-area';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { ScrollAreaDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<ScrollAreaProps, 'div'>;
  let { children, render, ref = $bindable(null), ...rest }: Props = $props();

  const runtimeProps = $derived({ ...rest });
</script>

<PrimitiveRoot
  definition={ScrollAreaDefinition}
  element="div"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
