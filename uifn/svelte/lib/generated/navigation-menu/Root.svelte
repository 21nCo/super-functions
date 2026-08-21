<script lang="ts">
  import type { NavigationMenuProps } from '@uifn/core/primitives/navigation-menu';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { NavigationMenuDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<NavigationMenuProps, 'nav'>;
  let { value = $bindable(), onValueChange, children, render, ref = $bindable(null), ...rest }: Props = $props();
  const handleValueChange = (next: Parameters<NonNullable<NavigationMenuProps['onValueChange']>>[0]) => {
    value = next;
    onValueChange?.(next);
  };
  const runtimeProps = $derived({ ...rest, value, onValueChange: handleValueChange });
</script>

<PrimitiveRoot
  definition={NavigationMenuDefinition}
  element="nav"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
