<script lang="ts">
  import type { ButtonProps } from '@uifn/core/primitives/button';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { ButtonDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<ButtonProps, 'button'>;
  let { children, render, ref = $bindable(null), ...rest }: Props = $props();

  const runtimeProps = $derived({ ...rest });
</script>

<PrimitiveRoot
  definition={ButtonDefinition}
  element="button"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
