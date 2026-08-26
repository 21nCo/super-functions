<script lang="ts">
  import type { MenubarProps } from '@uifn/core/primitives/menubar';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { MenubarDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<MenubarProps, 'div'>;
  let { value = $bindable(), onValueChange, children, render, ref = $bindable(null), ...rest }: Props = $props();
  const handleValueChange = (next: Parameters<NonNullable<MenubarProps['onValueChange']>>[0]) => {
    value = next;
    onValueChange?.(next);
  };
  const runtimeProps = $derived({ ...rest, value, onValueChange: handleValueChange });
</script>

<PrimitiveRoot
  definition={MenubarDefinition}
  element="div"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
