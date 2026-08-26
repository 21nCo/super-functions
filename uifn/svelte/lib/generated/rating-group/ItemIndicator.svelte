<script lang="ts">
  import type { RatingGroupController } from '@uifn/core/primitives/rating-group';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { RatingGroupDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<RatingGroupController['parts']['itemIndicator'], 'span', true>;
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
  definition={RatingGroupDefinition}
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
