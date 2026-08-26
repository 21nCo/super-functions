<script lang="ts">
  import type { PaginationController } from '@uifn/core/primitives/pagination';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { PaginationDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<PaginationController['parts']['list'], 'ul', false>;
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
  part="list"
  element="ul"
  many={false}
  props={rest}
  {value}
  {forceMount}
  {container}
  {children}
  {render}
  bind:ref
/>
