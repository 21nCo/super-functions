<script lang="ts">
  import type { AvatarProps } from '@uifn/core/primitives/avatar';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { AvatarDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<AvatarProps, 'span'>;
  let { children, render, ref = $bindable(null), ...rest }: Props = $props();

  const runtimeProps = $derived({ ...rest });
</script>

<PrimitiveRoot
  definition={AvatarDefinition}
  element="span"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
