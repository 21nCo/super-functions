<script lang="ts">
  import type { TextareaProps } from '@uifn/core/primitives/textarea';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { TextareaDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<TextareaProps, 'textarea'>;
  let { value = $bindable(), children, render, ref = $bindable(null), ...rest }: Props = $props();

  const runtimeProps = $derived({ ...rest, value });
</script>

<PrimitiveRoot
  definition={TextareaDefinition}
  element="textarea"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
