<script lang="ts">
  import type { SwitchController } from '@uifn/core/primitives/switch';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { SwitchDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<SwitchController['parts']['thumb'], 'span', false>;
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
  definition={SwitchDefinition}
  part="thumb"
  element="span"
  many={false}
  props={rest}
  {value}
  {forceMount}
  {container}
  {children}
  {render}
  bind:ref
/>
