<script lang="ts">
  import type { FieldsetProps } from '@uifn/core/primitives/fieldset';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { FieldsetDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<FieldsetProps, 'fieldset'>;
  let { children, render, ref = $bindable(null), ...rest }: Props = $props();

  const runtimeProps = $derived({ ...rest });
</script>

<PrimitiveRoot
  definition={FieldsetDefinition}
  element="fieldset"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
