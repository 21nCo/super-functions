<script lang="ts">
  import type { CheckboxGroupController } from '@uifn/core/primitives/checkbox-group';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { CheckboxGroupDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<CheckboxGroupController['parts']['itemIndicator'], 'span', true>;
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
  part="itemIndicator"
  element="span"
  many={true}
  props={rest}
  {value}
  {forceMount}
  {container}
  {children}
  {render}
  bind:ref
/>
