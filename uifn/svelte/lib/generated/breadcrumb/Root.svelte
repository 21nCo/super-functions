<script lang="ts">
  import type { BreadcrumbProps } from '@uifn/core/primitives/breadcrumb';
  import PrimitiveRoot from '../../internal/PrimitiveRoot.svelte';
  import type { SveltePrimitiveRootProps } from '../../internal/compound.js';
  import { BreadcrumbDefinition } from './definition.js';

  type Props = SveltePrimitiveRootProps<BreadcrumbProps, 'nav'>;
  let { children, render, ref = $bindable(null), ...rest }: Props = $props();

  const runtimeProps = $derived({ ...rest });
</script>

<PrimitiveRoot
  definition={BreadcrumbDefinition}
  element="nav"
  props={runtimeProps}
  {children}
  {render}
  bind:ref
/>
