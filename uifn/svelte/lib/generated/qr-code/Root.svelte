<script lang="ts">
  import type { QRCodeProps } from '@uifn/core/primitives/qr-code';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { QRCodeDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<QRCodeProps, 'figure'>;
  let { children, render, ref = $bindable(null), ...rest }: Props = $props();

  const runtimeProps = $derived({ ...rest });
</script>

<PrimitiveRoot
  definition={QRCodeDefinition}
  element="figure"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
