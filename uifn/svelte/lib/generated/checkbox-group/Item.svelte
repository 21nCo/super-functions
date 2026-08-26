<script lang="ts">
  import type { CheckboxGroupController } from '@uifn/core/primitives/checkbox-group';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { CheckboxGroupDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<CheckboxGroupController['parts']['item'], 'label', true>;
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
  definition={CheckboxGroupDefinition}
  part="item"
  element="label"
  many={true}
  props={rest}
  {value}
  {forceMount}
  {container}
  {children}
  {render}
  bind:ref
/>
