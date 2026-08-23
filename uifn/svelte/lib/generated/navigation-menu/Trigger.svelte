<script lang="ts">
  import type { NavigationMenuController } from '@uifn/core/primitives/navigation-menu';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { NavigationMenuDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<NavigationMenuController['parts']['trigger'], 'button', true>;
  let {
    value,
    forceMount = false,
    container,
    children,
    render,
    ref = $bindable(null),
    ...rest
  }: Props = $props();
</script>

<PrimitivePart
  definition={NavigationMenuDefinition}
  part="trigger"
  element="button"
  many={true}
  props={rest}
  {value}
  {forceMount}
  {container}
  {children}
  {render}
  bind:ref
/>
