<script lang="ts">
  import type { ToolbarProps } from '@uifn/core/primitives/toolbar';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { ToolbarDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<ToolbarProps, 'div'>;
  let { children, render, ref = $bindable(null), ...rest }: Props = $props();

  const runtimeProps = $derived({ ...rest });
</script>

<PrimitiveRoot
  definition={ToolbarDefinition}
  element="div"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
