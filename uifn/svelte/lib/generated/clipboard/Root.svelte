<script lang="ts">
  import type { ClipboardProps } from '@uifn/core/primitives/clipboard';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { ClipboardDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<ClipboardProps, 'div'>;
  let { children, render, ref = $bindable(null), ...rest }: Props = $props();

  const runtimeProps = $derived({ ...rest });
</script>

<PrimitiveRoot
  definition={ClipboardDefinition}
  element="div"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
