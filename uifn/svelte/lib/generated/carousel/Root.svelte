<script lang="ts">
  import type { CarouselProps } from '@uifn/core/primitives/carousel';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { CarouselDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<CarouselProps, 'section'>;
  let { index = $bindable(), onIndexChange, children, render, ref = $bindable(null), ...rest }: Props = $props();
  const handleIndexChange = (next: Parameters<NonNullable<CarouselProps['onIndexChange']>>[0]) => {
    index = next;
    onIndexChange?.(next);
  };
  const runtimeProps = $derived({ ...rest, index, onIndexChange: handleIndexChange });
</script>

<PrimitiveRoot
  definition={CarouselDefinition}
  element="section"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
