<script lang="ts">
  import type { SeparatorProps } from '@uifn/core/primitives/separator';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { SeparatorDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<SeparatorProps, 'div'>;
  let { children, render, ref = $bindable(null), ...rest }: Props = $props();

  const runtimeProps = $derived({ ...rest });
</script>

<PrimitiveRoot
  definition={SeparatorDefinition}
  element="div"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
