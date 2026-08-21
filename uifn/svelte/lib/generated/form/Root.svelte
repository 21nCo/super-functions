<script lang="ts">
  import type { FormProps } from '@uifn/core/primitives/form';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { FormDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<FormProps, 'form'>;
  let { children, render, ref = $bindable(null), ...rest }: Props = $props();

  const runtimeProps = $derived({ ...rest });
</script>

<PrimitiveRoot
  definition={FormDefinition}
  element="form"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
