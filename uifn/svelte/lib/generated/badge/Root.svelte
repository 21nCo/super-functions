<script lang="ts">
  import type { BadgeProps } from '@uifn/core/primitives/badge';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { BadgeDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<BadgeProps, 'span'>;
  let { children, render, ref = $bindable(null), ...rest }: Props = $props();

  const runtimeProps = $derived({ ...rest });
</script>

<PrimitiveRoot
  definition={BadgeDefinition}
  element="span"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
