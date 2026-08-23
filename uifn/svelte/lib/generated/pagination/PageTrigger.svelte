<script lang="ts">
  import type { PaginationController } from '@uifn/core/primitives/pagination';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { PaginationDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<PaginationController['parts']['pageTrigger'], 'button', true>;
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
  definition={PaginationDefinition}
  part="pageTrigger"
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
