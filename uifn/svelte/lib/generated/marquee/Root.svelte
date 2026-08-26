<script lang="ts">
  import type { MarqueeProps } from '@uifn/core/primitives/marquee';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { MarqueeDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<MarqueeProps, 'div'>;
  let { children, render, ref = $bindable(null), ...rest }: Props = $props();

  const runtimeProps = $derived({ ...rest });
</script>

<PrimitiveRoot
  definition={MarqueeDefinition}
  element="div"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
