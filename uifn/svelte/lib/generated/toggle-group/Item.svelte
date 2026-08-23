<script lang="ts">
  import type { ToggleGroupController } from '@uifn/core/primitives/toggle-group';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { ToggleGroupDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<ToggleGroupController['parts']['item'], 'button', true>;
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
  definition={ToggleGroupDefinition}
  part="item"
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
