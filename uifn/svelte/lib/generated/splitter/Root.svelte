<script lang="ts">
  import type { SplitterProps } from '@uifn/core/primitives/splitter';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { SplitterDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<SplitterProps, 'div'>;
  let { sizes = $bindable(), onSizesChange, children, render, ref = $bindable(null), ...rest }: Props = $props();
  const handleSizesChange = (next: Parameters<NonNullable<SplitterProps['onSizesChange']>>[0]) => {
    sizes = next;
    onSizesChange?.(next);
  };
  const runtimeProps = $derived({ ...rest, sizes, onSizesChange: handleSizesChange });
</script>

<PrimitiveRoot
  definition={SplitterDefinition}
  element="div"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
