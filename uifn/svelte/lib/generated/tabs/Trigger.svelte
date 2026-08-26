<script lang="ts">
  import type { TabsController } from '@uifn/core/primitives/tabs';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { TabsDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<TabsController['parts']['trigger'], 'button', true>;
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
  definition={TabsDefinition}
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
