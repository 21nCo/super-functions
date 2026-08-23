<script lang="ts">
  import type { CommandController } from '@uifn/core/primitives/command';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { CommandDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<CommandController['parts']['hiddenInput'], 'input', false>;
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
  part="hiddenInput"
  element="input"
  many={false}
  props={rest}
  {value}
  {forceMount}
  {container}
  {children}
  {render}
  bind:ref
/>
