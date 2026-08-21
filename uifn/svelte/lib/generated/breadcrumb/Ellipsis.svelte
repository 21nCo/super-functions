<script lang="ts">
  import type { BreadcrumbContractParts } from '@uifn/core/primitives/breadcrumb';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { BreadcrumbDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<BreadcrumbContractParts['ellipsis'], 'span', false>;
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
  definition={BreadcrumbDefinition}
  part="ellipsis"
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
