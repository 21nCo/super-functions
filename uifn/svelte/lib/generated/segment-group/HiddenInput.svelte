<script lang="ts">
  import type { SegmentGroupController } from '@uifn/core/primitives/segment-group';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { SegmentGroupDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<SegmentGroupController['parts']['hiddenInput'], 'input', false>;
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
  definition={SegmentGroupDefinition}
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
