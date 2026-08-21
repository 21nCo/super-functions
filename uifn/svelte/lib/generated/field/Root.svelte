<script lang="ts">
  import type { FieldProps } from '@uifn/core/primitives/field';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { FieldDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<FieldProps, 'div'>;
  let { children, render, ref = $bindable(null), ...rest }: Props = $props();

  const runtimeProps = $derived({ ...rest });
</script>

<PrimitiveRoot
  definition={FieldDefinition}
  element="div"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
