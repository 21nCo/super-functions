<script lang="ts">
  import type { CommandController } from '@uifn/core/primitives/command';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { CommandDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<CommandController['parts']['label'], 'label', false>;
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
  definition={CommandDefinition}
  part="label"
  element="label"
  many={false}
  props={rest}
  {value}
  {forceMount}
  {container}
  {children}
  {render}
  bind:ref
/>
