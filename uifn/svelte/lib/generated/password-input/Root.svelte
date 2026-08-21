<script lang="ts">
  import type { PasswordInputProps } from '@uifn/core/primitives/password-input';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { PasswordInputDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<PasswordInputProps, 'div'>;
  let { value = $bindable(), onValueChange, children, render, ref = $bindable(null), ...rest }: Props = $props();
  const handleValueChange = (next: Parameters<NonNullable<PasswordInputProps['onValueChange']>>[0]) => {
    value = next;
    onValueChange?.(next);
  };
  const runtimeProps = $derived({ ...rest, value, onValueChange: handleValueChange });
</script>

<PrimitiveRoot
  definition={PasswordInputDefinition}
  element="div"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
