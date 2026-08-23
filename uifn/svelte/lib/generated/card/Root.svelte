<script lang="ts">
  import type { CardProps } from '@uifn/core/primitives/card';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { CardDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<CardProps, 'div'>;
  let { children, render, ref = $bindable(null), ...rest }: Props = $props();

  const runtimeProps = $derived({ ...rest });
</script>

<PrimitiveRoot
  definition={CardDefinition}
  element="div"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
