<script lang="ts">
  import type { BreadcrumbContractParts } from '@uifn/core/primitives/breadcrumb';
  import PrimitivePart from '../../internal/PrimitivePart.svelte';
  import type { SveltePrimitivePartProps } from '../../internal/compound.js';
  import { BreadcrumbDefinition } from './definition.js';

  type Props = SveltePrimitivePartProps<BreadcrumbContractParts['link'], 'a', true>;
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
  part="link"
  element="a"
  many={true}
  props={rest}
  {value}
  {forceMount}
  {container}
  {children}
  {render}
  bind:ref
/>
