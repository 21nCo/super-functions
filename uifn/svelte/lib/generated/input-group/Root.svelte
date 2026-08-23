<script lang="ts">
  import type { InputGroupProps } from '@uifn/core/primitives/input-group';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { InputGroupDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<InputGroupProps, 'div'>;
  let { children, render, ref = $bindable(null), ...rest }: Props = $props();

  const runtimeProps = $derived({ ...rest });
</script>

<PrimitiveRoot
  definition={InputGroupDefinition}
  element="div"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
