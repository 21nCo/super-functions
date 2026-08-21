<script lang="ts">
  import type { CheckboxController } from '@uifn/core/primitives/checkbox';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { CheckboxDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<CheckboxController['parts']['indicator'], 'span', false>;
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
  definition={CheckboxDefinition}
  part="indicator"
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
