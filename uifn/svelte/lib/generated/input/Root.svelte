<script lang="ts">
  import type { InputProps } from '@uifn/core/primitives/input';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { InputDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<InputProps, 'input'>;
  let { value = $bindable(), oninput, children, render, ref = $bindable(null), ...rest }: Props = $props();
  const handleInput = (event: Event) => {
    value = (event.currentTarget as HTMLInputElement).value as typeof value;
    (oninput as ((event: Event) => void) | null | undefined)?.(event);
  };
  const runtimeProps = $derived({ ...rest, value, oninput: handleInput });
</script>

<PrimitiveRoot
  definition={InputDefinition}
  element="input"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
