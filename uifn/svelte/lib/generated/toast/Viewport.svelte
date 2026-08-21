<script lang="ts">
  import type { ToastProps } from '@uifn/core/primitives/toast';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { ToastDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<ToastProps, 'div'>;
  let { children, render, ref = $bindable(null), ...rest }: Props = $props();

  const runtimeProps = $derived({ ...rest });
</script>

<PrimitiveRoot
  definition={ToastDefinition}
  element="div"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
